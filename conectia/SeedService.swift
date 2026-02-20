import Foundation
import FirebaseFirestore
import UIKit // For ID generation if needed

struct SeedService {
    static let shared = SeedService()
    private let db = Firestore.firestore()
    
    // Images
    let profilePic = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"
    let imgCounter = "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=400&q=80"
    let imgDessert = "https://images.unsplash.com/photo-1563729784474-d779b9596388?auto=format&fit=crop&w=400&q=80"
    let imgTeacher = "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=400&q=80"
    let imgCleaning = "https://images.unsplash.com/photo-1581578731117-104f8a3d3df1?auto=format&fit=crop&w=400&q=80"
    
    func injectDemoData() async throws {
         guard let user = SessionManager().currentUser else { return }
         guard let uid = user.id else { return }
         
         // 1. Update User Profile (Maria Gonzalez) & Building
         guard let buildingId = user.buildingId else {
             print("SeedService: missing buildingId, aborting seed.")
             return
         }
         
         // Ensure Demo Building exists as Condo
         // Init: id, data OR memberwise
         // Memberwise for Building:
         // init?(id: String?, data: [String : Any]) -> We don't have memberwise public init in Models.swift for Building?
         // Let's check Models.swift... 
         // Struct Building has memberwise implicit? No, it has explicit init?(id, data...). 
         // Wait, Models.swift lines 256-268 define init?(id: String?, data: [String: Any]). 
         // IT DOES NOT HAVE A MEMBERWISE INIT EXPOSED for manual creation in swift code if we defined `init?`.
         // Wait, structs get auto memberwise init ONLY if no custom inits are provided.
         // Models.swift defines `init?(id: String?, data: [String : Any])`.
         // SO WE LOST THE DEFAULT MEMBERWISE INIT!
         // We must construct via data dictionary or add a manual init to Models.swift.
         // Fixing purely via Code Action in SeedService implies I should usage the `data` init or `FirestoreMappable` init if that's what's available.
         // HOWEVER, looking at Models.swift again... 
         // AppUser has `toFirestoreData`. It has `init?(id, data)`. 
         // It DOES NOT have a public memberwise init in the shown code?
         // Wait, previous file view of Models.swift showed:
         // `createPoll(poll)`... `Poll` needs init. 
         // Models.swift for Poll has `init(id:..., buildingId:...)` manual init declared at line 818 (in the last append).
         // So Poll is fine.
         // NetworkingProfile has manual init at line 777.
         // MarketplaceItem has manual init at line 687.
         
         // BUT `Building` (lines 246-286) ONLY has `init?(id, data)`. The default memberwise is gone.
         // `AppUser` (lines 43-101) ONLY has `init?(id, data)`.
         // So I must instantiate them differently or assuming I can modify properties after init if vars are mutable.
         // Or easier: Just use the `data` init for those legacy/existing structs.
         
         let buildingData: [String: Any] = [
             "name": "Torres del Parque",
             "type": BuildingType.condo.rawValue,
             "address": "Av. Siempre Viva 123",
             "adminEmail": "admin@demo.com",
             "notes": "Edificio Demo"
         ]
         guard let building = Building(id: buildingId, data: buildingData) else { return }
         
         try await FirestoreService.shared.updateBuilding(id: buildingId, building: building)
         
         // Update User
         // AppUser also lost memberwise init.
         // We can modify `user` because it's a struct and we did `var updatedUser = user`.
         var updatedUser = user
         updatedUser.fullName = "Maria González"
         updatedUser.photoURL = profilePic
         updatedUser.buildingId = buildingId
         updatedUser.role = .owner
         try await FirestoreService.shared.updateUser(id: uid, user: updatedUser)
         
         // 2. Networking
         // NetworkingProfile has manual init (line 777 in Models.swift view)
         let net1 = NetworkingProfile(
             id: nil,
             userId: UUID().uuidString,
             buildingId: buildingId,
             fullName: "Carlos Ruiz",
             avatarURL: "https://randomuser.me/api/portraits/men/32.jpg",
             profession: "Contador Público",
             bio: "Te ayudo con tu Declaración de Renta y balances personales. Vecino de la 402.",
             contactEmail: "carlos@cpa.com",
             linkedIn: nil
         )
         
         let net2 = NetworkingProfile(
             id: nil,
             userId: UUID().uuidString,
             buildingId: buildingId,
             fullName: "Ana Sofía",
             avatarURL: "https://randomuser.me/api/portraits/women/44.jpg",
             profession: "Repostería Artesanal",
             bio: "Postres deliciosos por encargo. ¡Pruébalos!",
             contactEmail: "ana@sweets.com",
             linkedIn: nil
         )
         
         let net3 = NetworkingProfile(
             id: nil,
             userId: UUID().uuidString,
             buildingId: buildingId,
             fullName: "David Miller",
             avatarURL: "https://randomuser.me/api/portraits/men/85.jpg",
             profession: "Teacher David",
             bio: "Clases de inglés para niños. Método divertido y conversacional. Tuesdays & Thursdays.",
             contactEmail: "david@english.com",
             linkedIn: nil
         )
         
         // Save Networking
         _ = try? await FirestoreService.shared.createNetworkingProfile(net1)
         _ = try? await FirestoreService.shared.createNetworkingProfile(net2)
         _ = try? await FirestoreService.shared.createNetworkingProfile(net3)
         
         // 3. Polls (Votaciones)
         // Poll has manual init (line 818 in Models.swift view)
         let poll = Poll(
             id: nil,
             buildingId: buildingId,
             question: "¿Aprobamos la remodelación del Lobby?",
             options: ["Sí", "No", "Abstención"],
             isActive: true,
             votesCount: nil
         )
         
         if let pid = try? await FirestoreService.shared.createPoll(poll) {
             // 6 Yes
             for i in 1...6 {
                 let v = PollVote(userId: "user_yes_\(i)", unitId: "unit_yes_\(i)", optionIndex: 0)
                 try? await FirestoreService.shared.castVote(pollId: pid, vote: v)
             }
             // 3 No
             for i in 1...3 {
                 let v = PollVote(userId: "user_no_\(i)", unitId: "unit_no_\(i)", optionIndex: 1)
                 try? await FirestoreService.shared.castVote(pollId: pid, vote: v)
             }
             // 1 Abs
             let v = PollVote(userId: "user_abs_1", unitId: "unit_abs_1", optionIndex: 2)
             try? await FirestoreService.shared.castVote(pollId: pid, vote: v)
         }

         // 4. Verified Services
         // MarketplaceItem has manual init (line 687 in Models.swift view)
         let s1 = MarketplaceItem(
             id: nil,
             type: .serviceVetted,
             title: "CleanHome Experts",
             description: "Limpieza profunda y desinfección de apartamentos. Personal de confianza verificado.",
             priceInfo: "Desde $50.000",
             imageURL: imgCleaning,
             contactPhone: "3001234567",
             contactLink: nil,
             buildingId: nil,
             createdAt: Date()
         )
         _ = try await FirestoreService.shared.createMarketplaceItem(s1)
         
         print("Seed Data Injected Successfully")
    }
}
