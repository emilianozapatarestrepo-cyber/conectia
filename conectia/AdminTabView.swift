import SwiftUI
import Combine

struct AdminTabView: View {
    var body: some View {
        TabView {
            NavigationStack {
                AdminTicketsView()
            }
            .tabItem { Label("Tickets", systemImage: "tray.full.fill") }

            NavigationStack {
                AdminBuildingsView()
            }
            .tabItem { Label("Edificios", systemImage: "building.2.fill") }

            NavigationStack {
                AdminUnitsView()
            }
            .tabItem { Label("Unidades", systemImage: "square.grid.2x2.fill") }

            NavigationStack {
                AdminUsersView() // Actualizado: lista desde "users"
            }
            .tabItem { Label("Usuarios", systemImage: "person.3.fill") }

            NavigationStack {
                AdminAmenitiesView()
            }
            .tabItem { Label("Amenities", systemImage: "sportscourt.fill") }

            NavigationStack {
                AdminReservationsView()
            }
            .tabItem { Label("Reservas", systemImage: "calendar.badge.clock") }

            NavigationStack {
                AdminAnnouncementsView()
            }
            .tabItem { Label("Avisos", systemImage: "megaphone.fill") }
        }
        .tint(.purple)
    }
}

struct AdminTicketsView: View {
    @StateObject private var vm = TicketsViewModel()
    var body: some View {
        List {
            ForEach(vm.tickets) { t in
                NavigationLink(t.title) {
                    TicketDetailView(ticket: t)
                }
            }
        }
        .navigationTitle("Tickets")
        .onAppear {
            // Evitamos pasar un userId vacío aunque no se use cuando isAdmin == true.
            // Uso de ID estandarizado (si SessionManager estuviera disponible aqui, mejor, 
            // pero AuthService.shared es el backend directo. Asumimos que AuthService tiene currentUserUID o similar.
            // Si AuthService no tiene currentUserUID publico, usamos Auth.auth().currentUser?.uid
            let uid = SessionManager().currentUserId ?? "" 
            vm.startListening(userId: uid, isAdmin: true)
        }
    }
}

struct AdminBuildingsView: View {
    @State private var buildings: [Building] = []
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        List {
            ForEach(buildings) { b in
                VStack(alignment: .leading) {
                    Text(b.name).font(.headline)
                    if let address = b.address { Text(address).font(.subheadline).foregroundColor(.secondary) }
                    if let adminEmail = b.adminEmail { Text("Admin: \(adminEmail)").font(.caption).foregroundColor(.secondary) }
                }
            }
        }
        .navigationTitle("Edificios")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { addBuilding() } label: { Image(systemName: "plus.circle.fill").foregroundColor(.purple) }
            }
        }
        .onAppear {
            FirestoreService.shared.listenBuildings()
                .receive(on: RunLoop.main)
                .sink(receiveCompletion: { _ in }, receiveValue: { self.buildings = $0 })
                .store(in: &cancellables)
        }
    }

    private func addBuilding() {
        Task {
            // Creamos el modelo usando el init(id:data:) alineado con nuestro mapeo manual.
            let data: [String: Any] = [
                "name": "Nuevo edificio"
                // "createdAt"/"updatedAt" se setean vía FieldValue.serverTimestamp() en toFirestoreData()
            ]
            if let building = Building(id: nil, data: data) {
                _ = try? await FirestoreService.shared.createBuilding(building)
            }
        }
    }
}

struct AdminUnitsView: View {
    @State private var units: [Unit] = []
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        List {
            ForEach(units) { u in
                VStack(alignment: .leading) {
                    Text("Unidad \(u.number)").font(.headline)
                    Text("Edificio: \(u.buildingId)").font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Unidades")
        .onAppear {
            FirestoreService.shared.listenUnits()
                .receive(on: RunLoop.main)
                .sink(receiveCompletion: { _ in }, receiveValue: { self.units = $0 })
                .store(in: &cancellables)
        }
    }
}

// Nueva vista: lista de usuarios desde la colección "users" (role == resident).
struct AdminUsersView: View {
    @State private var users: [AppUser] = []
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        List {
            ForEach(users) { u in
                VStack(alignment: .leading) {
                    Text(u.fullName).font(.headline)
                    Text(u.email).font(.subheadline).foregroundColor(.secondary)
                    if let b = u.buildingId {
                        Text("Edificio: \(b)").font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Usuarios")
        .onAppear {
            FirestoreService.shared.listenUsers(role: .resident)
                .receive(on: RunLoop.main)
                .sink(receiveCompletion: { _ in }, receiveValue: { self.users = $0 })
                .store(in: &cancellables)
        }
    }
}

// Nueva vista: amenities (simple)
struct AdminAmenitiesView: View {
    @State private var items: [Amenity] = []
    @State private var buildings: [Building] = []
    @State private var showingAddSheet = false
    @State private var newAmenityName = ""
    @State private var selectedBuildingId = ""
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        List {
            ForEach(items) { a in
                VStack(alignment: .leading) {
                    Text(a.name).font(.headline)
                    Text("Building: \(a.buildingId)").font(.caption).foregroundColor(.secondary)
                }
            }
            .onDelete(perform: deleteAmenity)
        }
        .navigationTitle("Amenities")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingAddSheet = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAddSheet) {
            NavigationStack {
                Form {
                    TextField("Nombre del Amenity", text: $newAmenityName)
                    Picker("Edificio", selection: $selectedBuildingId) {
                        Text("Seleccionar").tag("")
                        ForEach(buildings) { b in
                            Text(b.name).tag(b.id ?? "")
                        }
                    }
                }
                .navigationTitle("Nuevo Amenity")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancelar") { showingAddSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Guardar") {
                            addAmenity()
                        }
                        .disabled(newAmenityName.isEmpty || selectedBuildingId.isEmpty)
                    }
                }
            }
        }
        .onAppear {
            loadData()
        }
    }
    
    private func loadData() {
        FirestoreService.shared.listenAmenities()
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { self.items = $0 })
            .store(in: &cancellables)
            
        Task {
            if let builds = try? await FirestoreService.shared.fetchBuildings() {
                self.buildings = builds
            }
        }
    }
    
    private func addAmenity() {
        let newAm = Amenity(id: nil, data: [
            "name": newAmenityName,
            "buildingId": selectedBuildingId
            // createdAt set in service
        ])
        
        Task {
            if let valid = newAm {
                _ = try? await FirestoreService.shared.createAmenity(valid)
                newAmenityName = ""
                showingAddSheet = false
            }
        }
    }
    
    private func deleteAmenity(at offsets: IndexSet) {
        offsets.forEach { index in
            let item = items[index]
            guard let id = item.id else { return }
            Task {
                try? await FirestoreService.shared.deleteAmenity(id: id)
            }
        }
    }
}

// Nueva vista: reservas (simple)
struct AdminReservationsView: View {
    @State private var items: [Reservation] = []
    @State private var amenitiesDict: [String: String] = [:] // id -> name
    @State private var unitsDict: [String: String] = [:] // id -> number
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        List {
            if items.isEmpty {
                Text("No hay reservas registadas.")
            } else {
                ForEach(items) { r in
                    VStack(alignment: .leading) {
                        HStack {
                            Text(amenityName(r.amenityId)).font(.headline)
                            Spacer()
                            statusBadge(r.status)
                        }
                        Text("Unidad: \(unitName(r.unitId))").font(.subheadline)
                        
                        HStack {
                            Text(r.date.formatted(date: .abbreviated, time: .omitted))
                            Text("@ \(r.hour)")
                        }
                        .font(.caption)
                        .foregroundColor(.secondary)
                    }
                    .swipeActions(edge: .leading) {
                        if r.status == .pending {
                            Button {
                                updateStatus(r, to: .confirmed)
                            } label: {
                                Label("Confirmar", systemImage: "checkmark.circle")
                            }
                            .tint(.green)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if r.status != .cancelled {
                            Button(role: .destructive) {
                                updateStatus(r, to: .cancelled)
                            } label: {
                                Label("Rechazar/Cancelar", systemImage: "xmark.circle")
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Reservas")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: refresh) {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .onAppear {
            refresh()
        }
    }
    
    private func refresh() {
        FirestoreService.shared.listenReservations()
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { self.items = $0 })
            .store(in: &cancellables)
            
        // Load dictionaries safely using Combine listeners (since fetchAll is not available in FirestoreService)
        // 1. Amenities
        FirestoreService.shared.listenAmenities(buildingId: nil)
            .first()
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { list in
                self.amenitiesDict = Dictionary(uniqueKeysWithValues: list.map { ($0.id ?? "", $0.name) })
            })
            .store(in: &cancellables)
            
        // 2. Units
        FirestoreService.shared.listenUnits(buildingId: nil)
            .first()
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { list in
                self.unitsDict = Dictionary(uniqueKeysWithValues: list.map { ($0.id ?? "", $0.number) })
            })
            .store(in: &cancellables)
    }
    
    private func updateStatus(_ res: Reservation, to status: ReservationStatus) {
        guard let id = res.id else { return }
        var updated = res
        updated.status = status
        Task {
            try? await FirestoreService.shared.updateReservation(id: id, reservation: updated)
        }
    }
    
    private func amenityName(_ id: String) -> String {
        return amenitiesDict[id] ?? id
    }
    
    private func unitName(_ id: String) -> String {
        return unitsDict[id] ?? id
    }
    
    private func statusBadge(_ status: ReservationStatus) -> some View {
        Text(status.rawValue.capitalized)
            .font(.caption2)
            .padding(4)
            .background(Color.gray.opacity(0.1))
            .cornerRadius(4)
    }
}

struct AdminAnnouncementsView: View {
    @State private var items: [AppNotification] = []
    @State private var titleText = ""
    @State private var messageText = ""
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        VStack {
            Form {
                Section("Nuevo aviso") {
                    TextField("Título", text: $titleText)
                    TextField("Mensaje", text: $messageText, axis: .vertical).lineLimit(3...6)
                    Button("Publicar a residentes") {
                        Task { await publish() }
                    }.disabled(titleText.trimmingCharacters(in: .whitespaces).isEmpty || messageText.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            List {
                ForEach(items) { n in
                    VStack(alignment: .leading) {
                        Text(n.title).font(.headline)
                        Text(n.message).font(.subheadline).foregroundColor(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Avisos")
        .onAppear {
            FirestoreService.shared.listenNotifications(audience: "residents")
                .receive(on: RunLoop.main)
                .sink(receiveCompletion: { _ in }, receiveValue: { self.items = $0 })
                .store(in: &cancellables)
        }
    }

    private func publish() async {
        let data: [String: Any] = [
            "title": titleText.trimmingCharacters(in: .whitespaces),
            "message": messageText.trimmingCharacters(in: .whitespaces),
            "audience": "residents"
            // createdAt se setea en toFirestoreData() con FieldValue.serverTimestamp()
        ]
        if let n = AppNotification(id: nil, data: data) {
            _ = try? await FirestoreService.shared.createNotification(n)
            titleText = ""
            messageText = ""
        }
    }
}
