// EmailLoginView.swift (nuevo archivo)
import SwiftUI

/// Login simple usando SessionManager/AuthService (async/await).
/// No depende del sample AppManager/LoginDelegate.
struct EmailLoginView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("Inicia sesión").font(.title2).bold()
            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)

            SecureField("Contraseña", text: $password)
                .textContentType(.password)
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)

            Button {
                Task { await signIn() }
            } label: {
                HStack {
                    if isLoading { ProgressView() }
                    Text("Entrar").bold()
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.purple)
            .disabled(email.isEmpty || password.isEmpty || isLoading)

            if let errorMessage {
                Text(errorMessage).foregroundColor(.red).font(.footnote)
            }

            NavigationLink("¿Olvidaste tu contraseña?") {
                ForgotPasswordView()
            }
            .padding(.top, 8)

            Spacer()
        }
        .padding()
    }

    private func signIn() async {
        isLoading = true
        let result = await session.login(email: email.trimmingCharacters(in: .whitespaces),
                                         password: password)
        isLoading = false
        if case .failure(let error) = result {
            errorMessage = error.localizedDescription
        }
    }
}
