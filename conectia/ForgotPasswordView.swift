import SwiftUI

struct ForgotPasswordView: View {
    @EnvironmentObject private var session: SessionManager
    @Environment(\.dismiss) private var dismiss

    @State private var email: String = ""
    @State private var enviado: Bool = false

    @State private var isLoading: Bool = false
    @State private var showAlert: Bool = false
    @State private var alertTitle: String = "Mensaje"
    @State private var alertMessage: String?
    @State private var shouldDismissAfterAlert: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {

            Text("Recuperar contraseña")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.")
                .font(.subheadline)
                .foregroundColor(.gray)

            TextField("ejemplo@gmail.com", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled(true)
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)

            Button(action: { Task { await handleReset() } }) {
                HStack {
                    if isLoading { ProgressView().tint(.white) }
                    Text("Enviar enlace")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.purple)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(isLoading)

            if enviado {
                Text("📩 Te enviamos un enlace para restablecer tu contraseña.")
                    .font(.footnote)
                    .foregroundColor(.green)
                    .padding(.top, 8)
            }

            Spacer()
        }
        .padding()
        .navigationTitle("Recuperar contraseña")
        .alert(alertTitle, isPresented: $showAlert, actions: {
            Button("OK") {
                if shouldDismissAfterAlert {
                    dismiss()
                }
            }
        }, message: {
            Text(alertMessage ?? "")
        })
    }

    private func handleReset() async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        guard !trimmedEmail.isEmpty else {
            presentError("Por favor ingresa tu correo.")
            return
        }
        guard isValidEmail(trimmedEmail) else {
            presentError("Por favor ingresa un correo válido.")
            return
        }

        isLoading = true
        let result = await session.resetPassword(email: trimmedEmail)
        isLoading = false
        switch result {
        case .success:
            enviado = true
            presentSuccess("Te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada y sigue las instrucciones.")
        case .failure(let error):
            presentError(error.localizedDescription)
        }
    }

    private func presentSuccess(_ message: String) {
        alertTitle = "Correo enviado"
        alertMessage = message
        shouldDismissAfterAlert = true
        showAlert = true
    }

    private func presentError(_ message: String) {
        alertTitle = "No se pudo enviar"
        alertMessage = message
        shouldDismissAfterAlert = false
        showAlert = true
    }

    private func isValidEmail(_ email: String) -> Bool {
        let pattern = #"^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return NSPredicate(format: "SELF MATCHES %@", pattern).evaluate(with: email)
    }
}
