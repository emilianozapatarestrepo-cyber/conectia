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
                Color.white.ignoresSafeArea()

                VStack(spacing: 24) {
                    Spacer()

                    VStack(spacing: 8) {
                        Text("Conectia")
                            .font(.system(size: 32, weight: .heavy, design: .rounded))
                            .foregroundColor(.indigo)

                        Text("Bienvenida a tu comunidad")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    .padding(.bottom, 20)

                    VStack(spacing: 16) {
                        TextField("Correo electrónico", text: $email)
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)

                        SecureField("Contraseña", text: $password)
                            .textFieldStyle(.roundedBorder)
                    }
                    .padding(.horizontal, 24)

                    Button(action: { login() }) {
                        if isLoggingIn {
                            ProgressView().tint(.white)
                        } else {
                            Text("Iniciar Sesión").fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.indigo)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .padding(.horizontal, 24)
                    .disabled(isLoggingIn || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)

                    // Acciones secundarias (mínimo profesional)
                    VStack(spacing: 10) {
                        NavigationLink("Crear cuenta") {
                            RegisterView()
                                .environmentObject(session)
                        }

                        NavigationLink("Olvidé mi contraseña") {
                            ForgotPasswordView()
                                .environmentObject(session)
                        }
                    }
                    .font(.subheadline)
                    .foregroundColor(.indigo)

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
            print("🔐 [LoginView] login() started")
            let result = await session.login(email: email, password: password)
            switch result {
            case .success:
                print("✅ [LoginView] login succeeded")
            case .failure(let error):
                print("❌ [LoginView] login failed: \(error.localizedDescription)")
                errorMessage = error.localizedDescription
            }
            isLoggingIn = false
        }
    }
}

