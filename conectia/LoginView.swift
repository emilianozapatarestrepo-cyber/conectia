import SwiftUI

struct LoginView: View {
    @EnvironmentObject var session: SessionManager
    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage = ""
    @State private var isLoggingIn = false

    var body: some View {
        NavigationStack {
            ZStack {
                // Fondo limpio
                Color.white.ignoresSafeArea()
                
                VStack(spacing: 24) {
                    Spacer()
                    
                    // Título
                    VStack(spacing: 8) {
                        Text("Conectia")
                            .font(.system(size: 32, weight: .heavy, design: .rounded))
                            .foregroundColor(.indigo)
                        
                        Text("Bienvenida a tu comunidad")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    .padding(.bottom, 20)
                    
                    // Campos de Texto
                    VStack(spacing: 16) {
                        TextField("Correo electrónico", text: $email)
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                        
                        SecureField("Contraseña", text: $password)
                            .textFieldStyle(.roundedBorder)
                    }
                    .padding(.horizontal, 24)
                    
                    // Botón Login normal (Firebase)
                    Button(action: {
                        login()
                    }) {
                        if isLoggingIn {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Iniciar Sesión")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.indigo)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .padding(.horizontal, 24)
                    .disabled(isLoggingIn || email.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
                    
                    Divider()
                        .padding(.vertical)
                    
                    #if DEBUG
                    // --- MODO DEMO SOLO EN DEBUG ---
                    Button(action: {
                        print("⚡️ FORZANDO ACCESO DEMO...")
                        session.loginAsDemoUser()
                    }) {
                        HStack {
                            Image(systemName: "bolt.fill")
                            Text("ENTRAR MODO DEMO (MARÍA)")
                                .fontWeight(.bold)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(
                            LinearGradient(colors: [Color.indigo, Color.purple], startPoint: .leading, endPoint: .trailing)
                        )
                        .foregroundColor(.white)
                        .cornerRadius(16)
                        .shadow(color: .indigo.opacity(0.3), radius: 10, x: 0, y: 5)
                    }
                    .padding(.horizontal, 24)
                    #endif
                    // -----------------------------------
                    
                    Spacer()
                }
            }
            .alert(
                "Error",
                isPresented: Binding<Bool>(
                    get: { !errorMessage.isEmpty },
                    set: { newValue in
                        if newValue == false { errorMessage = "" }
                    }
                )
            ) {
                Button("OK") { errorMessage = "" }
            } message: {
                Text(errorMessage)
            }
        }
    }
    
    func login() {
        Task {
            isLoggingIn = true
            do {
                try await session.login(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoggingIn = false
        }
    }
}
