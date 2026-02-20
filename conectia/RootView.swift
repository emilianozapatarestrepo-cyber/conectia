import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionManager

    var body: some View {
        Group {
            if session.isLoading {
                LoadingView()
            } else if session.isAuthenticated, let user = session.currentUser {
                // Usuario autenticado CON documento - rutear por accessStatus
                switch user.accessStatus {
                case .onboarding:
                    OnboardingView()
                case .pendingApproval:
                    // Admin with buildingId -> bypass pending and go to admin view
                    if user.role == .admin && user.buildingId != nil {
                        AdminTabView()
                    } else {
                        AccessPendingView()
                    }
                case .active:
                    if user.role == .admin {
                        AdminTabView()
                    } else if user.role == .staff {
                        StaffHomeView()
                    } else {
                        MainTabView()
                    }
                }
            } else if session.isAuthenticated {
                // Autenticado pero doc no cargó aún
                AccessPendingView()
            } else {
                LoginView()
            }
        }
    }
}
