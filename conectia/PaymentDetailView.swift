import SwiftUI

struct PaymentDetailView: View {
    let payment: Payment
    @State private var showPago = false

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Monto a pagar")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text("$ \(Int(payment.amount)) \(payment.currency)")
                    .font(.largeTitle)
                    .fontWeight(.bold)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Descripción")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text(payment.description)
                    .font(.body)
            }

            if let due = payment.dueDate {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Fecha de vencimiento")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Text(due.formatted(date: .abbreviated, time: .omitted))
                }
            }

            Spacer()

            Button {
                showPago = true
            } label: {
                Text("Continuar con el pago")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.purple)
                    .foregroundColor(.white)
                    .cornerRadius(14)
            }
        }
        .padding()
        .navigationTitle("Pagar")
        .sheet(isPresented: $showPago) {
            NavigationStack {
                PagoDetalleView()
            }
        }
    }
}

#Preview {
    let sample = Payment(
        id: "1",
        data: [
            "userId": "u",
            "amount": 320000.0,
            "currency": "COP",
            "description": "Administración - Noviembre 2025",
            "dueDate": Date(),
            "status": PaymentStatus.pending.rawValue
        ]
    )!
    PaymentDetailView(payment: sample)
}
