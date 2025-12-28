import Foundation
import Combine
import FirebaseFirestore

// Protocolo común para mapear modelos a/desde Firestore sin FirebaseFirestoreSwift.
protocol FirestoreMappable {
    init?(id: String?, data: [String: Any])
    func toFirestoreData() -> [String: Any]
}

// Helpers de conversión
private func dateFrom(_ value: Any?) -> Date? {
    if let ts = value as? Timestamp { return ts.dateValue() }
    if let d = value as? Date { return d }
    return nil
}

private func stringFrom(_ value: Any?) -> String? {
    if let s = value as? String { return s }
    if let n = value as? NSNumber { return n.stringValue }
    return nil
}

// Roles soportados en la app. Deben coincidir con los valores guardados en Firestore.
// Roles soportados en la app.
enum UserRole: String, Codable, CaseIterable {
    case resident   // Inquilino/Habitante
    case owner      // Propietario (Condo)
    case staff      // Conserje/Técnico
    case manager    // Administrador del edificio
    case admin      // SuperAdmin Conectia
}

// Tipo de Edificio (Motor Híbrido)
enum BuildingType: String, Codable, CaseIterable {
    case condo          // Propiedad Horizontal
    case multifamily    // Renta Institucional
}

// Modelo unificado de usuario (colección "users").
// Nota: mantenemos fullName pero alineamos el almacenamiento a "name" en Firestore.
// También añadimos buildingId para alinear con el seed.
struct AppUser: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var uid: String
    var fullName: String            // Se codifica como "name" para alinear con el seed.
    var email: String
    var role: UserRole
    var buildingId: String?         // Campo recomendado por el plan/seed.
    var unitId: String?             // Added: Unit ID needed for voting/reservations
    var photoURL: String?           // Nuevo: soporte para foto de perfil
    var isActive: Bool
    var createdAt: Date?
    var updatedAt: Date?

    // FirestoreMappable
    init?(id: String?, data: [String : Any]) {
        guard
            let uid = data["uid"] as? String,
            let email = data["email"] as? String,
            let roleStr = data["role"] as? String,
            let role = UserRole(rawValue: roleStr),
            let isActive = data["isActive"] as? Bool
        else { return nil }

        // "name" (seed) o "fullName" (proyecto actual)
        let name = (data["name"] as? String) ?? (data["fullName"] as? String) ?? ""

        self.id = id
        self.uid = uid
        self.fullName = name
        self.email = email
        self.role = role

        self.buildingId = data["buildingId"] as? String
        self.unitId = data["unitId"] as? String // Added unitId
        self.photoURL = data["photoURL"] as? String
        self.isActive = isActive
        self.createdAt = dateFrom(data["createdAt"])
        self.updatedAt = dateFrom(data["updatedAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "uid": uid,
            // Escribimos como "name" (alineado con seed)
            "name": fullName,
            "email": email,
            "role": role.rawValue,
            "isActive": isActive
        ]
        if let buildingId { dict["buildingId"] = buildingId }
        if let unitId { dict["unitId"] = unitId } // Added unitId
        if let photoURL { dict["photoURL"] = photoURL }
        // Timestamps
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        dict["updatedAt"] = FieldValue.serverTimestamp()
        return dict
    }
}

// MARK: - Users (perfiles legacy)
// Se mantienen para compatibilidad mientras migramos a "users".

struct Resident: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String? // Firebase UID
    var uid: String
    var fullName: String
    var email: String
    var role: UserRole = .resident
    var buildingId: String?
    var unitNumber: String?
    var phone: String?
    var photoURL: String?
    var isActive: Bool
    var createdAt: Date?
    var updatedAt: Date?

    // Inicializador explícito para creación desde la app (p. ej. RegisterView)
    init(
        id: String? = nil,
        uid: String,
        fullName: String,
        email: String,
        role: UserRole = .resident,
        buildingId: String? = nil,
        unitNumber: String? = nil,
        phone: String? = nil,
        photoURL: String? = nil,
        isActive: Bool,
        createdAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.uid = uid
        self.fullName = fullName
        self.email = email
        self.role = role
        self.buildingId = buildingId
        self.unitNumber = unitNumber
        self.phone = phone
        self.photoURL = photoURL
        self.isActive = isActive
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init?(id: String?, data: [String : Any]) {
        guard
            let uid = data["uid"] as? String,
            let fullName = data["fullName"] as? String ?? data["name"] as? String, // por si existe "name"
            let email = data["email"] as? String,
            let isActive = data["isActive"] as? Bool
        else { return nil }
        self.id = id
        self.uid = uid
        self.fullName = fullName
        self.email = email
        if let roleStr = data["role"] as? String, let r = UserRole(rawValue: roleStr) {
            self.role = r
        } else {
            self.role = .resident
        }
        self.buildingId = data["buildingId"] as? String
        self.unitNumber = data["unitNumber"] as? String
        self.phone = data["phone"] as? String
        self.photoURL = data["photoURL"] as? String
        self.isActive = isActive
        self.createdAt = dateFrom(data["createdAt"])
        self.updatedAt = dateFrom(data["updatedAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "uid": uid,
            "fullName": fullName,
            "email": email,
            "role": role.rawValue,
            "isActive": isActive
        ]
        if let buildingId { dict["buildingId"] = buildingId }
        if let unitNumber { dict["unitNumber"] = unitNumber }
        if let phone { dict["phone"] = phone }
        if let photoURL { dict["photoURL"] = photoURL }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        dict["updatedAt"] = FieldValue.serverTimestamp()
        return dict
    }
}

struct Admin: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String? // Firebase UID
    var uid: String
    var fullName: String
    var email: String
    var phone: String?
    var photoURL: String?
    var isActive: Bool
    var createdAt: Date?
    var updatedAt: Date?

    init?(id: String?, data: [String : Any]) {
        guard
            let uid = data["uid"] as? String,
            let fullName = data["fullName"] as? String ?? data["name"] as? String,
            let email = data["email"] as? String,
            let isActive = data["isActive"] as? Bool
        else { return nil }
        self.id = id
        self.uid = uid
        self.fullName = fullName
        self.email = email
        self.phone = data["phone"] as? String
        self.photoURL = data["photoURL"] as? String
        self.isActive = isActive
        self.createdAt = dateFrom(data["createdAt"])
        self.updatedAt = dateFrom(data["updatedAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "uid": uid,
            "fullName": fullName,
            "email": email,
            "isActive": isActive
        ]
        if let phone { dict["phone"] = phone }
        if let photoURL { dict["photoURL"] = photoURL }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        dict["updatedAt"] = FieldValue.serverTimestamp()
        return dict
    }
}

// MARK: - Buildings / Units

struct Building: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var name: String
    var type: BuildingType = .condo // Default para migración
    var address: String?
    var adminEmail: String? = nil  // Alineado con el plan/seed (opcional para no romper).
    var notes: String?
    var createdAt: Date?
    var updatedAt: Date?

    init?(id: String?, data: [String : Any]) {
        guard let name = data["name"] as? String else { return nil }
        self.id = id
        self.name = name
        if let typeStr = data["type"] as? String, let t = BuildingType(rawValue: typeStr) {
            self.type = t
        }
        self.address = data["address"] as? String
        self.adminEmail = data["adminEmail"] as? String
        self.notes = data["notes"] as? String
        self.createdAt = dateFrom(data["createdAt"])
        self.updatedAt = dateFrom(data["updatedAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "name": name,
            "type": type.rawValue
        ]
        if let address { dict["address"] = address }
        if let adminEmail { dict["adminEmail"] = adminEmail }
        if let notes { dict["notes"] = notes }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        dict["updatedAt"] = FieldValue.serverTimestamp()
        return dict
    }
}

// Nota: nuestro proyecto usa "number", pero el seed recomienda "name".
// Decodificamos ambos; al codificar escribimos "name" para alinear con el seed.
struct Unit: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var buildingId: String
    var number: String
    var residentId: String?
    var floor: String?
    var notes: String?
    var createdAt: Date?
    var updatedAt: Date?

    init(buildingId: String, number: String, residentId: String? = nil, floor: String? = nil, notes: String? = nil, createdAt: Date? = nil, updatedAt: Date? = nil) {
        self.id = nil
        self.buildingId = buildingId
        self.number = number
        self.residentId = residentId
        self.floor = floor
        self.notes = notes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init?(id: String?, data: [String : Any]) {
        guard let buildingId = data["buildingId"] as? String else { return nil }
        self.id = id
        self.buildingId = buildingId
        if let n = data["number"] as? String {
            self.number = n
        } else {
            self.number = (data["name"] as? String) ?? ""
        }
        self.residentId = data["residentId"] as? String
        self.floor = data["floor"] as? String
        self.notes = data["notes"] as? String
        self.createdAt = dateFrom(data["createdAt"])
        self.updatedAt = dateFrom(data["updatedAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "buildingId": buildingId,
            // escribir como "name" (alineado con seed)
            "name": number
        ]
        if let residentId { dict["residentId"] = residentId }
        if let floor { dict["floor"] = floor }
        if let notes { dict["notes"] = notes }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        dict["updatedAt"] = FieldValue.serverTimestamp()
        return dict
    }
}

// MARK: - Payments

enum PaymentStatus: String, Codable, CaseIterable {
    case pending
    case paid
    case overdue
}

struct Payment: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var userId: String
    var buildingId: String?
    var unitId: String?
    var amount: Double
    var currency: String
    var description: String
    var dueDate: Date?
    var status: PaymentStatus
    var receiptURL: String?
    var invoiceId: String?
    var createdAt: Date?
    var updatedAt: Date?

    init?(id: String?, data: [String : Any]) {
        guard
            let userId = data["userId"] as? String,
            let amount = (data["amount"] as? Double) ?? (data["amount"] as? NSNumber)?.doubleValue,
            let currency = data["currency"] as? String,
            let description = data["description"] as? String,
            let statusStr = data["status"] as? String,
            let status = PaymentStatus(rawValue: statusStr)
        else { return nil }
        self.id = id
        self.userId = userId
        self.buildingId = data["buildingId"] as? String
        self.unitId = data["unitId"] as? String
        self.amount = amount
        self.currency = currency
        self.description = description
        self.dueDate = dateFrom(data["dueDate"])
        self.status = status
        self.receiptURL = data["receiptURL"] as? String
        self.invoiceId = data["invoiceId"] as? String
        self.createdAt = dateFrom(data["createdAt"])
        self.updatedAt = dateFrom(data["updatedAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "userId": userId,
            "amount": amount,
            "currency": currency,
            "description": description,
            "status": status.rawValue
        ]
        if let buildingId { dict["buildingId"] = buildingId }
        if let unitId { dict["unitId"] = unitId }
        if let dueDate { dict["dueDate"] = Timestamp(date: dueDate) }
        if let receiptURL { dict["receiptURL"] = receiptURL }
        if let invoiceId { dict["invoiceId"] = invoiceId }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        dict["updatedAt"] = FieldValue.serverTimestamp()
        return dict
    }
}

// MARK: - Tickets

enum TicketStatus: String, Codable, CaseIterable {
    case open
    case inReview
    case resolved
}

enum TicketPriority: String, Codable, CaseIterable {
    case low
    case medium
    case high
}

// Nota: nuestro proyecto usa "message", pero el seed recomienda "body".
// Decodificamos ambos; al codificar escribimos "body" para alinear con el seed.
struct Ticket: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var userId: String
    var buildingId: String?
    var unitId: String?
    var title: String
    var message: String
    var status: TicketStatus
    var priority: TicketPriority
    var attachmentURLs: [String]
    // Campos para Multifamily / Staff
    var permissionToEnter: Bool?
    var preferredEntryTime: String? // "Mañana", "Tarde", o texto libre
    
    var assignedAdminId: String?
    var createdAt: Date?
    var updatedAt: Date?

    init(
        id: String? = nil,
        userId: String,
        buildingId: String? = nil,
        unitId: String? = nil,
        title: String,
        message: String,
        status: TicketStatus,
        priority: TicketPriority,
        attachmentURLs: [String] = [],
        permissionToEnter: Bool? = nil,
        preferredEntryTime: String? = nil,
        assignedAdminId: String? = nil,
        createdAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.userId = userId
        self.buildingId = buildingId
        self.unitId = unitId
        self.title = title
        self.message = message
        self.status = status
        self.priority = priority
        self.attachmentURLs = attachmentURLs
        self.permissionToEnter = permissionToEnter
        self.preferredEntryTime = preferredEntryTime
        self.assignedAdminId = assignedAdminId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init?(id: String?, data: [String : Any]) {
        guard
            let userId = data["userId"] as? String,
            let title = data["title"] as? String,
            let statusStr = data["status"] as? String,
            let status = TicketStatus(rawValue: statusStr),
            let priorityStr = data["priority"] as? String,
            let priority = TicketPriority(rawValue: priorityStr)
        else { return nil }
        self.id = id
        self.userId = userId
        self.buildingId = data["buildingId"] as? String
        self.unitId = data["unitId"] as? String
        self.title = title
        // "message" o "body"
        self.message = (data["message"] as? String) ?? (data["body"] as? String) ?? ""
        self.status = status
        self.priority = priority
        self.attachmentURLs = data["attachmentURLs"] as? [String] ?? []
        self.permissionToEnter = data["permissionToEnter"] as? Bool
        self.preferredEntryTime = data["preferredEntryTime"] as? String
        self.assignedAdminId = data["assignedAdminId"] as? String
        self.createdAt = dateFrom(data["createdAt"])
        self.updatedAt = dateFrom(data["updatedAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "userId": userId,
            "title": title,
            // escribir como "body" (alineado con seed)
            "body": message,
            "status": status.rawValue,
            "priority": priority.rawValue,
            "attachmentURLs": attachmentURLs
        ]
        if let permissionToEnter { dict["permissionToEnter"] = permissionToEnter }
        if let preferredEntryTime { dict["preferredEntryTime"] = preferredEntryTime }
        
        if let buildingId { dict["buildingId"] = buildingId }
        if let unitId { dict["unitId"] = unitId }
        if let assignedAdminId { dict["assignedAdminId"] = assignedAdminId }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        dict["updatedAt"] = FieldValue.serverTimestamp()
        return dict
    }
}

// MARK: - App Notifications

struct AppNotification: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var title: String
    var message: String
    var audience: String? // e.g. "all", "residents", "admins", "building:<id>", "unit:<id>", "user:<uid>"
    var createdAt: Date?

    init?(id: String?, data: [String : Any]) {
        guard
            let title = data["title"] as? String,
            let message = data["message"] as? String
        else { return nil }
        self.id = id
        self.title = title
        self.message = message
        self.audience = data["audience"] as? String
        self.createdAt = dateFrom(data["createdAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "title": title,
            "message": message
        ]
        if let audience { dict["audience"] = audience }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        return dict
    }
}

// MARK: - Amenities (nueva)

struct Amenity: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var name: String
    var buildingId: String
    var createdAt: Date?

    init?(id: String?, data: [String : Any]) {
        guard
            let name = data["name"] as? String,
            let buildingId = data["buildingId"] as? String
        else { return nil }
        self.id = id
        self.name = name
        self.buildingId = buildingId
        self.createdAt = dateFrom(data["createdAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "name": name,
            "buildingId": buildingId
        ]
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        return dict
    }
}

// MARK: - Reservations (nueva)

enum ReservationStatus: String, Codable, CaseIterable {
    case pending
    case confirmed
    case cancelled
}

struct Reservation: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var amenityId: String
    var unitId: String
    var date: Date            // Día de la reserva (Timestamp/Date en Firestore)
    var hour: String          // Slot horario (p. ej. "18:00-19:00" o "HH:mm")
    var status: ReservationStatus
    var createdAt: Date?

    // Manual Memberwise Init
    init(
        id: String? = nil, 
        amenityId: String, 
        unitId: String, 
        date: Date, 
        hour: String, 
        status: ReservationStatus, 
        createdAt: Date? = nil
    ) {
        self.id = id
        self.amenityId = amenityId
        self.unitId = unitId
        self.date = date
        self.hour = hour
        self.status = status
        self.createdAt = createdAt
    }

    init?(id: String?, data: [String : Any]) {
        guard
            let amenityId = data["amenityId"] as? String,
            let unitId = data["unitId"] as? String,
            let date = dateFrom(data["date"]),
            let hour = data["hour"] as? String,
            let statusStr = data["status"] as? String,
            let status = ReservationStatus(rawValue: statusStr)
        else { return nil }
        self.id = id
        self.amenityId = amenityId
        self.unitId = unitId
        self.date = date
        self.hour = hour
        self.status = status
        self.createdAt = dateFrom(data["createdAt"])
    }

    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "amenityId": amenityId,
            "unitId": unitId,
            "date": Timestamp(date: date),
            "hour": hour,
            "status": status.rawValue
        ]
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        return dict
    }
}

// MARK: - MISSING MODELS ADDED (GLOBAL SCOPE)

enum MarketplaceType: String, Codable, CaseIterable {
    case serviceVetted
    case perk
}

struct MarketplaceItem: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var type: MarketplaceType
    var title: String
    var description: String
    var priceInfo: String?
    var imageURL: String?
    var contactPhone: String?
    var contactLink: String?
    var buildingId: String?
    var createdAt: Date?
    
    init(
        id: String? = nil,
        type: MarketplaceType,
        title: String,
        description: String,
        priceInfo: String? = nil,
        imageURL: String? = nil,
        contactPhone: String? = nil,
        contactLink: String? = nil,
        buildingId: String? = nil,
        createdAt: Date? = nil
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.description = description
        self.priceInfo = priceInfo
        self.imageURL = imageURL
        self.contactPhone = contactPhone
        self.contactLink = contactLink
        self.buildingId = buildingId
        self.createdAt = createdAt
    }
    
    init?(id: String?, data: [String : Any]) {
        guard
            let typeStr = data["type"] as? String,
            let type = MarketplaceType(rawValue: typeStr),
            let title = data["title"] as? String,
            let description = data["description"] as? String
        else { return nil }
        
        self.id = id
        self.type = type
        self.title = title
        self.description = description
        self.priceInfo = data["priceInfo"] as? String
        self.imageURL = data["imageURL"] as? String
        self.contactPhone = data["contactPhone"] as? String
        self.contactLink = data["contactLink"] as? String
        self.buildingId = data["buildingId"] as? String
        self.createdAt = dateFrom(data["createdAt"])
    }
    
    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "type": type.rawValue,
            "title": title,
            "description": description
        ]
        if let priceInfo { dict["priceInfo"] = priceInfo }
        if let imageURL { dict["imageURL"] = imageURL }
        if let contactPhone { dict["contactPhone"] = contactPhone }
        if let contactLink { dict["contactLink"] = contactLink }
        if let buildingId { dict["buildingId"] = buildingId }
        
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        return dict
    }
}

struct NetworkingProfile: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var userId: String
    var buildingId: String
    var fullName: String
    var avatarURL: String?
    var profession: String
    var bio: String
    var contactEmail: String?
    var linkedIn: String?
    var createdAt: Date?
    // user's requested fields dummy mapping if needed, but sticking to SeedService usage
    
    init(id: String? = nil, userId: String, buildingId: String, fullName: String, avatarURL: String?, profession: String, bio: String, contactEmail: String?, linkedIn: String?) {
        self.id = id
        self.userId = userId
        self.buildingId = buildingId
        self.fullName = fullName
        self.avatarURL = avatarURL
        self.profession = profession
        self.bio = bio
        self.contactEmail = contactEmail
        self.linkedIn = linkedIn
    }
    
    init?(id: String?, data: [String : Any]) {
        guard
            let userId = data["userId"] as? String,
            let buildingId = data["buildingId"] as? String,
            let fullName = data["fullName"] as? String,
            let profession = data["profession"] as? String,
            let bio = data["bio"] as? String
        else { return nil }
        
        self.id = id
        self.userId = userId
        self.buildingId = buildingId
        self.fullName = fullName
        self.avatarURL = data["avatarURL"] as? String
        self.profession = profession
        self.bio = bio
        self.contactEmail = data["contactEmail"] as? String
        self.linkedIn = data["linkedIn"] as? String
        self.createdAt = dateFrom(data["createdAt"])
    }
    
    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "userId": userId,
            "buildingId": buildingId,
            "fullName": fullName,
            "profession": profession,
            "bio": bio
        ]
        if let avatarURL { dict["avatarURL"] = avatarURL }
        if let contactEmail { dict["contactEmail"] = contactEmail }
        if let linkedIn { dict["linkedIn"] = linkedIn }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        return dict
    }
}

struct Poll: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var buildingId: String
    var question: String
    var options: [String]
    var isActive: Bool
    var votesCount: [Int]?
    var createdAt: Date?
    
    init(id: String? = nil, buildingId: String, question: String, options: [String], isActive: Bool, votesCount: [Int]? = nil) {
        self.id = id
        self.buildingId = buildingId
        self.question = question
        self.options = options
        self.isActive = isActive
        self.votesCount = votesCount
    }
    
    init?(id: String?, data: [String : Any]) {
        guard
            let buildingId = data["buildingId"] as? String,
            let question = data["question"] as? String,
            let options = data["options"] as? [String],
            let isActive = data["isActive"] as? Bool
        else { return nil }
        self.id = id
        self.buildingId = buildingId
        self.question = question
        self.options = options
        self.isActive = isActive
        self.votesCount = data["votesCount"] as? [Int]
        self.createdAt = dateFrom(data["createdAt"])
    }
    
    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "buildingId": buildingId,
            "question": question,
            "options": options,
            "isActive": isActive
        ]
        if let votesCount { dict["votesCount"] = votesCount }
        if let createdAt {
            dict["createdAt"] = Timestamp(date: createdAt)
        } else {
            dict["createdAt"] = FieldValue.serverTimestamp()
        }
        return dict
    }
}

struct PollVote: Codable, Identifiable, Equatable, FirestoreMappable {
    var id: String?
    var userId: String
    var unitId: String
    var optionIndex: Int
    var createdAt: Date?
    
    init(userId: String, unitId: String, optionIndex: Int) {
        self.userId = userId
        self.unitId = unitId
        self.optionIndex = optionIndex
    }
    
    init?(id: String?, data: [String : Any]) {
        guard
            let userId = data["userId"] as? String,
            let unitId = data["unitId"] as? String,
            let optionIndex = data["optionIndex"] as? Int
        else { return nil }
        self.id = id
        self.userId = userId
        self.unitId = unitId
        self.optionIndex = optionIndex
        self.createdAt = dateFrom(data["createdAt"])
    }
    
    func toFirestoreData() -> [String : Any] {
        var dict: [String: Any] = [
            "userId": userId,
            "unitId": unitId,
            "optionIndex": optionIndex
        ]
        dict["createdAt"] = FieldValue.serverTimestamp()
        return dict
    }
}
