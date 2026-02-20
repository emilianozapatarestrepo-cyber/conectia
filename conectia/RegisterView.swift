import SwiftUI

struct RegisterView: View {
    @EnvironmentObject private var session: SessionManager

    @State private var nombre: String = ""
    @State private var email: String = ""
    @State private var telefono: String = ""
    @State private var password: String = ""
    @State private var password2: String = ""

    @State private var isLoading: Bool = false
    @State private var showAlert: Bool = false
    @State private var alertMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {

                Text("Crear cuenta")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Group {
                    TextField("Nombre completo", text: $nombre)
                        .textInputAutocapitalization(.words)
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(12)

                    TextField("Correo electrónico", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled(true)
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(12)

                    TextField("Número de teléfono", text: $telefono)
                        .keyboardType(.phonePad)
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(12)

                    SecureField("Contraseña", text: $password)
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(12)

                    SecureField("Confirmar contraseña", text: $password2)
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(12)
                }

                Button(action: { Task { await handleRegister() } }) {
                    HStack {
                        if isLoading { ProgressView().tint(.white) }
                        Text("Crear cuenta")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.purple)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .padding(.top, 10)
                .disabled(isLoading)

                Spacer()
            }
            .padding()
        }
        .alert("Mensaje", isPresented: $showAlert, actions: {
            Button("OK", role: .cancel) { }
        }, message: {
            Text(alertMessage ?? "")
        })
        .navigationTitle("Registro")
    }

    private func handleRegister() async {
        guard validateInputs() else { return }
        isLoading = true
        
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        let result = await session.register(
            email: trimmedEmail, 
            password: password,
            fullName: nombre,
            role: .resident
        )
        
        switch result {
        case .success:
            // ✅ El documento users/{uid} ya fue creado por SessionManager
            // Ya NO creamos Resident legacy aquí
            break
            
        case .failure(let error):
            presentError(error.localizedDescription)
        }
        
        isLoading = false
    }

    private func validateInputs() -> Bool {
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        guard !nombre.trimmingCharacters(in: .whitespaces).isEmpty,
              !trimmedEmail.isEmpty,
              !password.isEmpty,
              !password2.isEmpty else {
            presentError("Por favor completa todos los campos obligatorios.")
            return false
        }
        guard isValidEmail(trimmedEmail) else {
            presentError("Por favor ingresa un correo válido.")
            return false
        }
        guard password.count >= 6 else {
            presentError("La contraseña debe tener al menos 6 caracteres.")
            return false
        }
        guard password == password2 else {
            presentError("Las contraseñas no coinciden.")
            return false
        }
        return true
    }

    private func presentError(_ message: String) {
        alertMessage = message
        showAlert = true
    }

    private func isValidEmail(_ email: String) -> Bool {
        let pattern = #"^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return NSPredicate(format: "SELF MATCHES %@", pattern).evaluate(with: email)
    }
}

