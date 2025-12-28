import SwiftUI

struct PagoDetalleView: View {
    let monto: Double = 320000
    let descripcion = "Administración - Noviembre 2025"
    
    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: 24) {
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Monto a pagar")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    Text("$ \(Int(monto)) COP")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Descripción")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    Text(descripcion)
                        .font(.body)
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Método de pago")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    HStack {
                        Image(systemName: "creditcard.fill")
                            .foregroundColor(.purple)
                        
                        Text("Tarjeta de crédito o débito")
                            .font(.body)
                        
                        Spacer()
                        
                        Image(systemName: "chevron.right")
                            .foregroundColor(.gray)
                    }
                    .padding()
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(12)
                }
                
                Spacer()
                
                Button(action: {}) {
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
        }
    }
}

#Preview {
    PagoDetalleView()
}

