import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack {
                ResidentHomeView()
            }
            .tabItem { Label("Inicio", systemImage: "house.fill") }

            NavigationStack {
                TicketListView()
            }
            .tabItem { Label("Tickets", systemImage: "tray.full.fill") }

            NavigationStack {
                PaymentsListView()
            }
            .tabItem { Label("Pagos", systemImage: "creditcard.fill") }
            
            NavigationStack {
                ServicesTabView() // Marketplace B2C
            }
            .tabItem { Label("Servicios", systemImage: "storefront.fill") }
            
            NavigationStack {
                NetworkingView() // Networking C2C
            }
            .tabItem { Label("Comunidad", systemImage: "person.2.fill") }

            // Tabs exclusivos para Dueños en Condominios
            if isCondoOwner {
                NavigationStack {
                    PollsView()
                }
                .tabItem { Label("Votaciones", systemImage: "hand.raised.fill") }
                
                NavigationStack {
                    BuildingFinancialsView()
                }
                .tabItem { Label("Finanzas", systemImage: "chart.pie.fill") }
            }

            NavigationStack {
                ProfileView()
            }
            .tabItem { Label("Perfil", systemImage: "person.crop.circle") }
        }
        .tint(Color.brandPrimary)
    }
    
    // Helper computado dentro de la View
    @EnvironmentObject private var session: SessionManager
    
    var isCondoOwner: Bool {
        return session.currentBuilding?.type == .condo && session.currentUser?.role == .owner
    }
}

