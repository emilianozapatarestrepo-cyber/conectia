import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionManager

    var body: some View {
        Group {
            // Alineado con el plan: isLoading + currentUser + isAdmin derivado.
            if session.isLoading {
                LoadingView()
            } else if let user = session.currentUser {
                if user.role == .admin {
                    AdminTabView()
                } else if user.role == .staff {
                    StaffHomeView()
                } else {
                    MainTabView() // Home de residente
                }
            } else {
                // Usamos una vista de login alineada con SessionManager/AuthService.
                NavigationStack {
                    LoginView()
                }
            }
        }
    }
}
