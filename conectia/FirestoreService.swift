import Foundation
import Combine
import FirebaseFirestore

// Capa centralizada de acceso a Firestore con async/await y listeners Combine.
// Refactor: sin FirebaseFirestoreSwift. Usamos mapeo manual [String: Any] <-> modelos (FirestoreMappable).
final class FirestoreService {

    static let shared = FirestoreService()
    private init() {}

    private let db = Firestore.firestore()

    // MARK: - Tenant guard helpers

    private func tenantErrorPublisher<T>(reason: String) -> AnyPublisher<[T], Error> {
        #if DEBUG
        print("🔴 Tenant guard failed: \(reason)")
        return Fail(error: TenantError.missingBuildingId)
            .eraseToAnyPublisher()
        #else
        print("⚠️ Tenant guard: \(reason)")
        return Empty(completeImmediately: true)
            .eraseToAnyPublisher()
        #endif
    }

    // Alias para compatibilidad (todas las llamadas actuales usan este nombre)
    private func emptyTenantPublisher<T>(reason: String) -> AnyPublisher<[T], Error> {
        return tenantErrorPublisher(reason: reason)
    }
    
    private func hasTenant(_ buildingId: String?) -> String? {
        guard let bid = buildingId, !bid.isEmpty else {
            #if DEBUG
            print("⚠️ [hasTenant] Validation failed - buildingId is \(buildingId == nil ? "nil" : "empty string")")
            #endif
            return nil
        }
        return bid
    }

    // MARK: - Generic helpers

    func setDocument<T: FirestoreMappable>(_ value: T, in collection: String, id: String) async throws {
        // Escritura con merge, usando diccionario manual. Incluye serverTimestamp en updatedAt y createdAt si corresponde.
        let data = value.toFirestoreData()
        try await db.collection(collection).document(id).setData(data, merge: true)
    }

    func addDocument<T: FirestoreMappable>(_ value: T, to collection: String) async throws -> String {
        let data = value.toFirestoreData()
        let ref = try await db.collection(collection).addDocument(data: data)
        return ref.documentID
    }

    func getDocument<T: FirestoreMappable>(collection: String, id: String) async throws -> T? {
        let snapshot = try await db.collection(collection).document(id).getDocument()
        guard let data = snapshot.data() else { return nil }
        return T(id: snapshot.documentID, data: data)
    }

    func deleteDocument(collection: String, id: String) async throws {
        try await db.collection(collection).document(id).delete()
    }

    func listenCollection<T: FirestoreMappable>(
        collection: String,
        whereField: String? = nil,
        isEqualTo: Any? = nil,
        orderBy: String? = nil,
        descending: Bool = false,
        limit: Int? = nil
    ) -> AnyPublisher<[T], Error> {
        let subject = PassthroughSubject<[T], Error>()
        var query: Query = db.collection(collection)
        if let whereField, let isEqualTo {
            query = query.whereField(whereField, isEqualTo: isEqualTo)
        }
        if let orderBy {
            query = query.order(by: orderBy, descending: descending)
        }
        if let limit {
            query = query.limit(to: limit)
        }
        let listener = query.addSnapshotListener { snapshot, error in
            if let error = error {
                subject.send(completion: .failure(error))
                return
            }
            let models: [T] = snapshot?.documents.compactMap { doc in
                // data() ya es [String: Any]
                T(id: doc.documentID, data: doc.data())
            } ?? []
            subject.send(models)
        }
        return subject
            .handleEvents(receiveCancel: { listener.remove() })
            .eraseToAnyPublisher()
    }

    func listenDocument<T: FirestoreMappable>(collection: String, id: String) -> AnyPublisher<T?, Never> {
        let subject = PassthroughSubject<T?, Never>()
        let listener = db.collection(collection).document(id).addSnapshotListener { snapshot, _ in
            guard let snapshot = snapshot, let data = snapshot.data() else {
                subject.send(nil)
                return
            }
            let model = T(id: snapshot.documentID, data: data)
            subject.send(model)
        }
        return subject
            .handleEvents(receiveCancel: { listener.remove() })
            .eraseToAnyPublisher()
    }

    // MARK: - Pagination (generic helper)

    struct Page<T> {
        let items: [T]
        let lastSnapshot: DocumentSnapshot?
    }

    /// Obtiene una página de documentos con cursor opcional.
    func fetchPage<T: FirestoreMappable>(
        collection: String,
        whereEqual filters: [(field: String, value: Any)] = [],
        orderBy: String,
        descending: Bool = false,
        limit: Int,
        startAfter: DocumentSnapshot? = nil
    ) async throws -> Page<T> {
        var query: Query = db.collection(collection).order(by: orderBy, descending: descending).limit(to: limit)
        for f in filters {
            query = query.whereField(f.field, isEqualTo: f.value)
        }
        if let startAfter {
            query = query.start(afterDocument: startAfter)
        }
        let snapshot = try await query.getDocuments()
        let items: [T] = snapshot.documents.compactMap { doc in
            T(id: doc.documentID, data: doc.data())
        }
        let last = snapshot.documents.last
        return Page(items: items, lastSnapshot: last)
    }

    // MARK: - Users (colección unificada "users")

    func getUser(id: String) async throws -> AppUser? {
        let snapshot = try await db.collection("users").document(id).getDocument()
        guard let data = snapshot.data() else { 
            #if DEBUG
            print("🔴 [FirestoreService.getUser] No document found for users/\(id)")
            #endif
            return nil 
        }
        
        #if DEBUG
        print("🟢 [FirestoreService.getUser] RAW data for users/\(id):")
        print("   - buildingId: \(data["buildingId"] ?? "missing")")
        print("   - unitId: \(data["unitId"] ?? "missing")")
        print("   - email: \(data["email"] ?? "missing")")
        print("   - role: \(data["role"] ?? "missing")")
        #endif
        
        return AppUser(id: snapshot.documentID, data: data)
    }

    /// Busca un usuario por email en la colección "users".
    func fetchUser(byEmail email: String) async throws -> AppUser? {
        let normalizedEmail = email.lowercased().trimmingCharacters(in: .whitespaces)
        
        let snapshot = try await db.collection("users")
            .whereField("emailLowercased", isEqualTo: normalizedEmail)
            .limit(to: 1)
            .getDocuments()
        
        guard let doc = snapshot.documents.first else { return nil }
        return AppUser(id: doc.documentID, data: doc.data())
    }

    func listenUsers(role: UserRole? = nil, orderBy: String = "createdAt", descending: Bool = true) -> AnyPublisher<[AppUser], Error> {
        if let role {
            return listenCollection(collection: "users", whereField: "role", isEqualTo: role.rawValue, orderBy: orderBy, descending: descending)
        } else {
            return listenCollection(collection: "users", orderBy: orderBy, descending: descending)
        }
    }

    func createUser(id: String, user: AppUser) async throws {
        try await setDocument(user, in: "users", id: id)
    }

    func updateUser(id: String, user: AppUser) async throws {
        try await setDocument(user, in: "users", id: id)
    }

    func updateUserAccessStatus(id: String, status: AccessStatus) async throws {
        try await db.collection("users").document(id).updateData([
            "accessStatus": status.rawValue,
            "updatedAt": FieldValue.serverTimestamp()
        ])
    }

    // MARK: - Onboarding Catalog

    func listBuildings() async throws -> [Building] {
        let snapshot = try await db.collection("buildings").order(by: "name").getDocuments()
        return snapshot.documents.compactMap { Building(id: $0.documentID, data: $0.data()) }
    }

    func listUnits(buildingId: String) async throws -> [OnboardingUnit] {
        let snapshot = try await db.collection("units")
            .whereField("buildingId", isEqualTo: buildingId)
            .order(by: "label")
            .getDocuments()
        return snapshot.documents.compactMap { OnboardingUnit(id: $0.documentID, data: $0.data()) }
    }

    // MARK: - Access Requests

    func createAccessRequest(_ request: AccessRequest) async throws -> String {
        try await addDocument(request, to: "accessRequests")
    }

    func updateUserPendingApproval(uid: String, buildingId: String, unitId: String, occupancyRole: OccupantType) async throws {
        try await db.collection("users").document(uid).updateData([
            "accessStatus": AccessStatus.pendingApproval.rawValue,
            "requestedBuildingId": buildingId,
            "requestedUnitId": unitId,
            "requestedOccupancyRole": occupancyRole.rawValue,
            "updatedAt": FieldValue.serverTimestamp()
        ])
    }

    // MARK: - Residents/Admins (legacy)
    // Se mantienen para compatibilidad mientras migras a "users".

    func createResident(uid: String, resident: Resident) async throws {
        try await setDocument(resident, in: "residents", id: uid)
    }

    func updateResident(uid: String, resident: Resident) async throws {
        try await setDocument(resident, in: "residents", id: uid)
    }

    func deleteResident(uid: String) async throws {
        try await deleteDocument(collection: "residents", id: uid)
    }

    func getResident(uid: String) async throws -> Resident? {
        try await getDocument(collection: "residents", id: uid)
    }

    func listenResident(uid: String) -> AnyPublisher<Resident?, Never> {
        listenDocument(collection: "residents", id: uid)
    }

    func listenResidents() -> AnyPublisher<[Resident], Error> {
        listenCollection(collection: "residents", orderBy: "createdAt", descending: true)
    }

    func createAdmin(uid: String, admin: Admin) async throws {
        try await setDocument(admin, in: "admins", id: uid)
    }

    func updateAdmin(uid: String, admin: Admin) async throws {
        try await setDocument(admin, in: "admins", id: uid)
    }

    func deleteAdmin(uid: String) async throws {
        try await deleteDocument(collection: "admins", id: uid)
    }

    func getAdmin(uid: String) async throws -> Admin? {
        try await getDocument(collection: "admins", id: uid)
    }

    func listenAdmin(uid: String) -> AnyPublisher<Admin?, Never> {
        listenDocument(collection: "admins", id: uid)
    }

    func listenAdmins() -> AnyPublisher<[Admin], Error> {
        listenCollection(collection: "admins", orderBy: "createdAt", descending: true)
    }

    // MARK: - Tickets

    func listenTicketsForUser(_ uid: String, buildingId: String?) -> AnyPublisher<[Ticket], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenTicketsForUser missing buildingId")
        }
        let subject = PassthroughSubject<[Ticket], Error>()
        let query = db.collection("tickets")
            .whereField("buildingId", isEqualTo: bid)
            .whereField("userId", isEqualTo: uid)
            .order(by: "createdAt", descending: true)

        let listener = query.addSnapshotListener { snapshot, error in
            if let error { subject.send(completion: .failure(error)); return }
            let models: [Ticket] = snapshot?.documents.compactMap { Ticket(id: $0.documentID, data: $0.data()) } ?? []
            subject.send(models)
        }
        return subject
            .handleEvents(receiveCancel: { listener.remove() })
            .eraseToAnyPublisher()
    }

    func listenAllTickets(buildingId: String?) -> AnyPublisher<[Ticket], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenAllTickets missing buildingId")
        }
        return listenCollection(
            collection: "tickets",
            whereField: "buildingId",
            isEqualTo: bid,
            orderBy: "createdAt",
            descending: true
        )
    }

    func listenTicketsFiltered(
        userId: String? = nil,
        buildingId: String?,
        status: TicketStatus? = nil,
        assignedAdminId: String? = nil,
        orderBy: String = "createdAt",
        descending: Bool = true,
        limit: Int? = nil
    ) -> AnyPublisher<[Ticket], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenTicketsFiltered missing buildingId")
        }
        let subject = PassthroughSubject<[Ticket], Error>()
        var query: Query = db.collection("tickets").whereField("buildingId", isEqualTo: bid)
        if let userId { query = query.whereField("userId", isEqualTo: userId) }
        if let status { query = query.whereField("status", isEqualTo: status.rawValue) }
        if let assignedAdminId { query = query.whereField("assignedAdminId", isEqualTo: assignedAdminId) }
        query = query.order(by: orderBy, descending: descending)
        if let limit { query = query.limit(to: limit) }

        let listener = query.addSnapshotListener { snapshot, error in
            if let error { subject.send(completion: .failure(error)); return }
            let models: [Ticket] = snapshot?.documents.compactMap { doc in
                Ticket(id: doc.documentID, data: doc.data())
            } ?? []
            subject.send(models)
        }
        return subject
            .handleEvents(receiveCancel: { listener.remove() })
            .eraseToAnyPublisher()
    }

    func createTicket(_ ticket: Ticket) async throws -> String {
        try await addDocument(ticket, to: "tickets")
    }

    func updateTicket(id: String, ticket: Ticket) async throws {
        try await setDocument(ticket, in: "tickets", id: id)
    }

    func deleteTicket(id: String) async throws {
        try await deleteDocument(collection: "tickets", id: id)
    }

    // Lectura puntual (async) de tickets
    func fetchTickets(forUser uid: String, buildingId: String?) async throws -> [Ticket] {
        guard let bid = hasTenant(buildingId) else {
            print("Tenant guard: fetchTickets missing buildingId")
            return []
        }
        let snapshot = try await db.collection("tickets")
            .whereField("buildingId", isEqualTo: bid)
            .whereField("userId", isEqualTo: uid)
            .order(by: "createdAt", descending: true)
            .getDocuments()
        return snapshot.documents.compactMap { Ticket(id: $0.documentID, data: $0.data()) }
    }

    // MARK: - Payments

    func listenPaymentsForUser(_ uid: String, buildingId: String?) -> AnyPublisher<[Payment], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenPaymentsForUser missing buildingId")
        }
        return listenCollection(
            collection: "payments",
            whereField: "buildingId",
            isEqualTo: bid,
            orderBy: "createdAt",
            descending: true
        )
        .map { $0.filter { $0.userId == uid } }
        .eraseToAnyPublisher()
    }

    func listenAllPayments(buildingId: String?) -> AnyPublisher<[Payment], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenAllPayments missing buildingId")
        }
        return listenCollection(
            collection: "payments",
            whereField: "buildingId",
            isEqualTo: bid,
            orderBy: "createdAt",
            descending: true
        )
    }

    func listenPaymentsFiltered(
        userId: String? = nil,
        buildingId: String?,
        status: PaymentStatus? = nil,
        orderBy: String = "createdAt",
        descending: Bool = true,
        limit: Int? = nil
    ) -> AnyPublisher<[Payment], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenPaymentsFiltered missing buildingId")
        }
        let subject = PassthroughSubject<[Payment], Error>()
        var query: Query = db.collection("payments").whereField("buildingId", isEqualTo: bid)
        if let userId { query = query.whereField("userId", isEqualTo: userId) }
        if let status { query = query.whereField("status", isEqualTo: status.rawValue) }
        query = query.order(by: "createdAt", descending: descending)
        if let limit { query = query.limit(to: limit) }

        let listener = query.addSnapshotListener { snapshot, error in
            if let error { subject.send(completion: .failure(error)); return }
            let models: [Payment] = snapshot?.documents.compactMap { doc in
                Payment(id: doc.documentID, data: doc.data())
            } ?? []
            subject.send(models)
        }
        return subject
            .handleEvents(receiveCancel: { listener.remove() })
            .eraseToAnyPublisher()
    }

    func createPayment(_ payment: Payment) async throws -> String {
        try await addDocument(payment, to: "payments")
    }

    func updatePayment(id: String, payment: Payment) async throws {
        try await setDocument(payment, in: "payments", id: id)
    }

    func deletePayment(id: String) async throws {
        try await deleteDocument(collection: "payments", id: id)
    }

    // MARK: - Buildings

    func listenBuildings() -> AnyPublisher<[Building], Error> {
        listenCollection(collection: "buildings", orderBy: "createdAt", descending: true)
    }

    func getBuilding(id: String) async throws -> Building? {
        try await getDocument(collection: "buildings", id: id)
    }

    func createBuilding(_ building: Building) async throws -> String {
        try await addDocument(building, to: "buildings")
    }

    func updateBuilding(id: String, building: Building) async throws {
        try await setDocument(building, in: "buildings", id: id)
    }

    func deleteBuilding(id: String) async throws {
        try await deleteDocument(collection: "buildings", id: id)
    }

    func fetchBuildings() async throws -> [Building] {
        let snapshot = try await db.collection("buildings")
            .order(by: "createdAt", descending: true)
            .getDocuments()
        return snapshot.documents.compactMap { Building(id: $0.documentID, data: $0.data()) }
    }

    // MARK: - Units

    func listenUnits(buildingId: String? = nil) -> AnyPublisher<[Unit], Error> {
        if let buildingId {
            return listenCollection(collection: "units", whereField: "buildingId", isEqualTo: buildingId, orderBy: "createdAt", descending: false)
        } else {
            return listenCollection(collection: "units", orderBy: "createdAt", descending: false)
        }
    }

    func listenUnitsFiltered(buildingId: String? = nil, residentId: String? = nil) -> AnyPublisher<[Unit], Error> {
        let subject = PassthroughSubject<[Unit], Error>()
        var query: Query = db.collection("units")
        if let buildingId { query = query.whereField("buildingId", isEqualTo: buildingId) }
        if let residentId { query = query.whereField("residentId", isEqualTo: residentId) }
        query = query.order(by: "createdAt", descending: false)

        let listener = query.addSnapshotListener { snapshot, error in
            if let error { subject.send(completion: .failure(error)); return }
            let models = snapshot?.documents.compactMap { Unit(id: $0.documentID, data: $0.data()) } ?? []
            subject.send(models)
        }
        return subject
            .handleEvents(receiveCancel: { listener.remove() })
            .eraseToAnyPublisher()
    }

    func createUnit(_ unit: Unit) async throws -> String {
        try await addDocument(unit, to: "units")
    }

    func updateUnit(id: String, unit: Unit) async throws {
        try await setDocument(unit, in: "units", id: id)
    }

    func deleteUnit(id: String) async throws {
        try await deleteDocument(collection: "units", id: id)
    }

    func fetchUnits(for buildingId: String) async throws -> [Unit] {
        let snapshot = try await db.collection("units")
            .whereField("buildingId", isEqualTo: buildingId)
            .order(by: "createdAt", descending: false)
            .getDocuments()
        return snapshot.documents.compactMap { Unit(id: $0.documentID, data: $0.data()) }
    }

    // MARK: - Amenities

    func listenAmenities(buildingId: String?) -> AnyPublisher<[Amenity], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenAmenities missing buildingId")
        }
        return listenCollection(collection: "amenities", whereField: "buildingId", isEqualTo: bid, orderBy: "createdAt", descending: false)
    }

    func fetchAmenities(for buildingId: String?) async throws -> [Amenity] {
        guard let bid = hasTenant(buildingId) else {
            print("Tenant guard: fetchAmenities missing buildingId")
            return []
        }
        let snapshot = try await db.collection("amenities")
            .whereField("buildingId", isEqualTo: bid)
            .order(by: "createdAt", descending: false)
            .getDocuments()
        return snapshot.documents.compactMap { Amenity(id: $0.documentID, data: $0.data()) }
    }

    func createAmenity(_ amenity: Amenity) async throws -> String {
        try await addDocument(amenity, to: "amenities")
    }

    func updateAmenity(id: String, amenity: Amenity) async throws {
        try await setDocument(amenity, in: "amenities", id: id)
    }

    func deleteAmenity(id: String) async throws {
        try await deleteDocument(collection: "amenities", id: id)
    }

    // MARK: - Reservations

    func listenReservations(amenityId: String? = nil, unitId: String? = nil, buildingId: String?) -> AnyPublisher<[Reservation], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenReservations missing buildingId")
        }
        let subject = PassthroughSubject<[Reservation], Error>()
        var query: Query = db.collection("reservations").whereField("buildingId", isEqualTo: bid)
        if let amenityId { query = query.whereField("amenityId", isEqualTo: amenityId) }
        if let unitId { query = query.whereField("unitId", isEqualTo: unitId) }
        query = query.order(by: "createdAt", descending: true)
        let listener = query.addSnapshotListener { snapshot, error in
            if let error { subject.send(completion: .failure(error)); return }
            let items = snapshot?.documents.compactMap { Reservation(id: $0.documentID, data: $0.data()) } ?? []
            subject.send(items)
        }
        return subject.handleEvents(receiveCancel: { listener.remove() }).eraseToAnyPublisher()
    }

    func fetchReservations(forAmenity amenityId: String, buildingId: String?) async throws -> [Reservation] {
        guard let bid = hasTenant(buildingId) else {
            print("Tenant guard: fetchReservations missing buildingId")
            return []
        }
        let snapshot = try await db.collection("reservations")
            .whereField("buildingId", isEqualTo: bid)
            .whereField("amenityId", isEqualTo: amenityId)
            .order(by: "createdAt", descending: true)
            .getDocuments()
        return snapshot.documents.compactMap { Reservation(id: $0.documentID, data: $0.data()) }
    }

    func createReservation(_ reservation: Reservation) async throws -> String {
        try await addDocument(reservation, to: "reservations")
    }

    func updateReservation(id: String, reservation: Reservation) async throws {
        try await setDocument(reservation, in: "reservations", id: id)
    }

    func deleteReservation(id: String) async throws {
        try await deleteDocument(collection: "reservations", id: id)
    }

    // MARK: - Notifications

    func listenNotifications(audience: String? = nil, buildingId: String?) -> AnyPublisher<[AppNotification], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenNotifications missing buildingId")
        }
        let subject = PassthroughSubject<[AppNotification], Error>()
        var query: Query = db.collection("notifications").whereField("buildingId", isEqualTo: bid)
        if let audience {
            query = query.whereField("audience", isEqualTo: audience)
        }
        query = query.order(by: "createdAt", descending: true)
        let listener = query.addSnapshotListener { snapshot, error in
            if let error { subject.send(completion: .failure(error)); return }
            let items = snapshot?.documents.compactMap { AppNotification(id: $0.documentID, data: $0.data()) } ?? []
            subject.send(items)
        }
        return subject.handleEvents(receiveCancel: { listener.remove() }).eraseToAnyPublisher()
    }

    func createNotification(_ notification: AppNotification) async throws -> String {
        try await addDocument(notification, to: "notifications")
    }

    func deleteNotification(id: String) async throws {
        try await deleteDocument(collection: "notifications", id: id)
    }
    
    // MARK: - Marketplace (Services & Perks)
    
    func listenMarketplace(buildingId: String?) -> AnyPublisher<[MarketplaceItem], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenMarketplace missing buildingId")
        }
        return listenCollection(collection: "marketplace", whereField: "buildingId", isEqualTo: bid, orderBy: "createdAt", descending: true)
    }
    
    func createMarketplaceItem(_ item: MarketplaceItem) async throws -> String {
        try await addDocument(item, to: "marketplace")
    }
    
    // MARK: - Networking (Vecinos)
    
    func listenNetworking(buildingId: String) -> AnyPublisher<[NetworkingProfile], Error> {
        // Networking es RESTRINGIDO al edificio.
        return listenCollection(collection: "networking", whereField: "buildingId", isEqualTo: buildingId, orderBy: "createdAt", descending: true)
    }
    
    func createNetworkingProfile(_ profile: NetworkingProfile) async throws -> String {
        try await addDocument(profile, to: "networking")
    }
    
    // Check if user has a profile
    func fetchNetworkingProfile(userId: String) async throws -> NetworkingProfile? {
        let snapshot = try await db.collection("networking")
            .whereField("userId", isEqualTo: userId)
            .limit(to: 1)
            .getDocuments()
        guard let doc = snapshot.documents.first else { return nil }
        return NetworkingProfile(id: doc.documentID, data: doc.data())
    }
    
    // MARK: - Polls (Condo Owner)
    
    func listenPolls(buildingId: String?) -> AnyPublisher<[Poll], Error> {
        guard let bid = hasTenant(buildingId) else {
            return emptyTenantPublisher(reason: "listenPolls missing buildingId")
        }
        return listenCollection(collection: "polls", whereField: "buildingId", isEqualTo: bid, orderBy: "createdAt", descending: true)
    }
    
    func createPoll(_ poll: Poll) async throws -> String {
        try await addDocument(poll, to: "polls")
    }
    
    // Votar: Guarda el voto en subcolección y actualiza contador (simplificado sin transacciones por ahora o usaríamos Cloud Functions)
    // Para MVP: Cliente actualiza contador. *NOTA: No es seguro para prod, pero cumple MVP.*
    func castVote(pollId: String, vote: PollVote) async throws {
        // 1. Guardar voto usando unitId como key para evitar doble voto
        let voteData = vote.toFirestoreData()
        try await db.collection("polls").document(pollId).collection("votes").document(vote.unitId).setData(voteData)
        
        // 2. Incrementar contador en documento padre (Atomic Increment)
        // Necesitamos saber qué índice es.
        // Firestore no soporta incrementar un elemento de array por índice fácilmente.
        // Solución MVP: No actualizamos el contador aquí, el cliente debe leer la subcolección O usamos un mapa `votesCounts: {"0": 10}`.
        // Vamos a asumir que leemos los votos después o que usamos un Cloud Function trigger.
        // Para visualización inmediata en MVP: Incrementaremos un campo mapa si es posible, o simplemente recalculated en cliente.
        // CAMBIO: Vamos a usar un mapa plano en el modelo si queremos updates atómicos, pero `[Int]` es dificil.
        // Dejémoslo solo en guardar voto. El cliente calculará leyendo la subcolección 'votes' por ahora (pocos votos).
    }
    
    // Escuchar votos de una poll (para calcular resultados en tiempo real)
    func listenPollVotes(pollId: String) -> AnyPublisher<[PollVote], Error> {
        let subject = PassthroughSubject<[PollVote], Error>()
        let listener = db.collection("polls").document(pollId).collection("votes")
            .addSnapshotListener { snapshot, error in
                if let error { subject.send(completion: .failure(error)); return }
                let votes = snapshot?.documents.compactMap { PollVote(id: $0.documentID, data: $0.data()) } ?? []
                subject.send(votes)
            }
        return subject.handleEvents(receiveCancel: { listener.remove() }).eraseToAnyPublisher()
    }
    
    // Verificar si mi unidad ya votó
    func checkMyVote(pollId: String, unitId: String) async throws -> PollVote? {
        let doc = try await db.collection("polls").document(pollId).collection("votes").document(unitId).getDocument()
        guard let data = doc.data() else { return nil }
        return PollVote(id: doc.documentID, data: data)
    }
}
