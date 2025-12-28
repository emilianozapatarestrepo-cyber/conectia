import SwiftUI

struct BuildingFinancialsView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    
                    // Header
                    VStack(alignment: .leading) {
                        Text("Transparencia Financiera")
                            .font(.title2).bold()
                        Text("Estado de cuenta del edificio - Diciembre 2025")
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    
                    // Chart: Recaudo vs Gastos
                    ChartCard(title: "Ejecución Presupuestal", 
                              value1: 25000, label1: "Recaudado", color1: .brandSecondary,
                              value2: 12000, label2: "Gastado", color2: .red)

                    // Chart: Fondo Imprevistos
                    VStack(alignment: .leading) {
                        Text("Fondo de Imprevistos")
                            .font(.headline)
                        Text("$45,200 USD")
                            .roundedFont(.largeTitle, weight: .bold)
                            .foregroundColor(.blue)
                        Text("Disponible en Caja")
                            .font(.caption).foregroundColor(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .softCardStyle()
                    .padding(.horizontal)
                    
                    // Chart: Cartera
                    VStack(alignment: .leading) {
                        Text("Cartera (Morosidad)")
                            .font(.headline)
                        HStack {
                            VStack(alignment: .leading) {
                                Text("85%")
                                    .roundedFont(.title, weight: .bold)
                                    .foregroundColor(.brandSecondary)
                                Text("Al día")
                                    .font(.caption)
                            }
                            Spacer()
                            VStack(alignment: .leading) {
                                Text("15%")
                                    .roundedFont(.title, weight: .bold)
                                    .foregroundColor(.red)
                                Text("Vencida")
                                    .font(.caption)
                            }
                        }
                        .padding(.top, 8)
                        
                        // Barra visual
                        GeometryReader { g in
                            HStack(spacing: 0) {
                                Rectangle().fill(Color.brandSecondary).frame(width: g.size.width * 0.85)
                                Rectangle().fill(Color.red).frame(width: g.size.width * 0.15)
                            }
                        }
                        .frame(height: 12)
                        .cornerRadius(6)
                    }
                    .padding()
                    .softCardStyle()
                    .padding(.horizontal)
                    
                }
            }
            .navigationTitle("Finanzas")
        }
    }
}

struct ChartCard: View {
    let title: String
    let value1: Double
    let label1: String
    let color1: Color
    let value2: Double
    let label2: String
    let color2: Color
    
    var maxVal: Double { max(value1, value2) * 1.1 }
    
    var body: some View {
        VStack(alignment: .leading) {
            Text(title).font(.headline)
            
            HStack(alignment: .bottom, spacing: 16) {
                VStack {
                    ZStack(alignment: .bottom) {
                        Capsule().fill(Color.gray.opacity(0.1)).frame(width: 40, height: 150)
                        Capsule().fill(color1).frame(width: 40, height: 150 * (value1 / maxVal))
                    }
                    Text(label1).font(.caption).bold()
                    Text("$\(Int(value1))").font(.caption2).foregroundColor(.secondary)
                }
                
                VStack {
                    ZStack(alignment: .bottom) {
                        Capsule().fill(Color.gray.opacity(0.1)).frame(width: 40, height: 150)
                        Capsule().fill(color2).frame(width: 40, height: 150 * (value2 / maxVal))
                    }
                    Text(label2).font(.caption).bold()
                    Text("$\(Int(value2))").font(.caption2).foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}
