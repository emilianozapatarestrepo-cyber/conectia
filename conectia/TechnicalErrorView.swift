import SwiftUI

struct TechnicalErrorView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var isSigningOut = false
    @State private var isRetrying = false
    
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 60))
                .foregroundColor(.orange)
            
            VStack(spacing: 12) {
                Text("Error técnico")
                    .font(.title)
                    .fontWeight(.bold)
                
                Text("No pudimos cargar tu perfil. Por favor intenta cerrar sesión y volver a iniciar.")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .padding(.horizontal)
            }
            
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
