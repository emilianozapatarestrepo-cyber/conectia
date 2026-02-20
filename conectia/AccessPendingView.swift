import SwiftUI

struct AccessPendingView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var isSigningOut = false
    @State private var isRetrying = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "clock.badge.checkmark")
                .font(.system(size: 50))
                .foregroundColor(.indigo)
            Text("Bienvenido a Conectia")
                .font(.title2)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)
            Text("Gracias por registrarte. Tu solicitud está siendo revisada por el administrador. Te daremos acceso a tu unidad tan pronto sea aprobado.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            VStack(spacing: 12) {
                Button {
                    Task {
                        isRetrying = true
                        await session.refreshSession()
                        isRetrying = false
                    }
                } label: {
                    if isRetrying {
                        ProgressView()
                    } else {
                        Text("Reintentar")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.bordered)

                Button(role: .destructive) {
                    Task {
                        isSigningOut = true
                        _ = await session.signOut()
                        isSigningOut = false
                    }
                } label: {
                    if isSigningOut {
                        ProgressView()
                    } else {
                        Text("Cerrar sesión")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
            }
            .padding(.horizontal)
            Spacer()
        }
        .padding()
    }
}
