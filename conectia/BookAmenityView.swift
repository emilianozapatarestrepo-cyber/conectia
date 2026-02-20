import SwiftUI
import Combine

struct BookAmenityView: View {
    let amenity: Amenity
    @EnvironmentObject private var session: SessionManager
    @Environment(\.dismiss) private var dismiss
    
    @State private var selectedDate = Date()
    @State private var selectedHour: String? = nil
    @State private var existingReservations: [Reservation] = []
    @State private var userUnit: Unit? = nil
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    
    // Horarios fijos de ejemplo (podrían ser configurables en un futuro)
    let availableHours = [
        "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", 
        "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
    ]
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack {
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 40))
                        .foregroundColor(.purple)
                    Text("Reservar \(amenity.name)")
                        .font(.title2)
                        .fontWeight(.bold)
                }
                .padding(.top)
                
                if isLoading {
                    ProgressView("Cargando disponibilidad...")
                } else if userUnit == nil {
                    VStack {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle)
                            .foregroundColor(.orange)
                        Text("No tienes una unidad asignada. Contacta al administrador.")
                            .multilineTextAlignment(.center)
                            .padding()
                    }
                } else {
                    // Selección de fecha
                    DatePicker("Selecciona fecha", selection: $selectedDate, in: Date()..., displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .onChange(of: selectedDate) { _ in
                            selectedHour = nil // Reset al cambiar dia
                        }
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(12)
                    
                    // Selección de hora
                    VStack(alignment: .leading) {
                        Text("Horarios disponibles")
                            .font(.headline)
                        
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 80))], spacing: 12) {
                            ForEach(availableHours, id: \.self) { hour in
                                let isTaken = isSlotTaken(hour: hour)
                                Button {
                                    selectedHour = hour
                                } label: {
                                    Text(hour)
                                        .font(.subheadline)
                                        .padding(.vertical, 8)
                                        .frame(maxWidth: .infinity)
                                        .background(isTaken ? Color.gray.opacity(0.3) : (selectedHour == hour ? Color.purple : Color.purple.opacity(0.1)))
                                        .foregroundColor(isTaken ? .gray : (selectedHour == hour ? .white : .purple))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(Color.purple, lineWidth: selectedHour == hour ? 0 : 1)
                                        )
                                }
                                .disabled(isTaken)
                            }
                        }
                    }
                    
                    // Resumen y botón
                    if let hour = selectedHour {
                        VStack(spacing: 16) {
                            Divider()
                            HStack {
                                Text("Fecha:")
                                Spacer()
                                Text(selectedDate.formatted(date: .long, time: .omitted))
                                    .fontWeight(.bold)
                            }
                            HStack {
                                Text("Hora:")
                                Spacer()
                                Text(hour)
                                    .fontWeight(.bold)
                            }
                            
                            if let error = errorMessage {
                                Text(error)
                                    .foregroundColor(.red)
                                    .font(.caption)
                            }
                            
                            Button {
                                makeReservation()
                            } label: {
                                if isSaving {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Confirmar Reserva")
                                        .bold()
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.purple)
                            .disabled(isSaving)
                        }
                        .padding()
                        .background(Color.purple.opacity(0.05))
                        .cornerRadius(12)
                    }
                }
            }
            .padding()
        }
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            loadData()
        }
    }
    
    private func loadData() {
        guard let uid = session.currentUserId else { return } // FIX: Use standardized ID
        isLoading = true
        
        Task {
            do {
                // 1. Buscar unidad del usuario
                // Intentamos buscar por buildingId si lo tenemos, o buscamos en general
                var units: [Unit] = []
                if let buildingId = session.currentUser?.buildingId {
                     // El service tiene `listenUnitsFiltered` que devuelve Publisher, pero aqui quiero asincrono puntual.
                     // Service no tiene `fetchUnit(byResident:)`. Usaremos el publisher conversion o fetch manual.
                     // FirestoreService.shared.listenUnitsFiltered devuelve publisher.
                     // Vamos a usar la funcion `fetchUnits` del building, y filtrar en memoria por ahora (mvp).
                     let buildingUnits = try await FirestoreService.shared.fetchUnits(for: buildingId)
                     units = buildingUnits.filter { $0.residentId == uid }
                }
                // Si no encontramos (o no hay buildingId), no podemos reservar.
                self.userUnit = units.first
                
                // 2. Cargar reservas existentes para chequear disponibilidad
                if let id = amenity.id {
                    self.existingReservations = try await FirestoreService.shared.fetchReservations(forAmenity: id, buildingId: amenity.buildingId)
                }
                
                isLoading = false
            } catch {
                print("Error loading data: \(error)")
                isLoading = false
            }
        }
    }
    
    private func isSlotTaken(hour: String) -> Bool {
        // Chequear si existe reserva en existingReservations con misma fecha (dia) y hora
        return existingReservations.contains { r in
            // Comparar fecha es tricky por timestamps.
            // Simplificación: Calendar compare
            let rDate = r.date
            let sameDay = Calendar.current.isDate(rDate, inSameDayAs: selectedDate)
            return sameDay && r.hour == hour && r.status != .cancelled
        }
    }
    
    private func makeReservation() {
        guard let unit = userUnit, let unitId = unit.id, let amenityId = amenity.id, let hour = selectedHour else { return }
        
        isSaving = true
        
        let newRes = Reservation(
            id: nil,
            amenityId: amenityId,
            unitId: unitId,
            date: selectedDate, // Guardamos la fecha completa seleccionada (que incluye hora 00:00 o actual por defecto del picker)
            hour: hour,
            status: .pending
        )
        
        Task {
            do {
                _ = try await FirestoreService.shared.createReservation(newRes)
                isSaving = false
                dismiss()
            } catch {
                errorMessage = "Error al reservar: \(error.localizedDescription)"
                isSaving = false
            }
        }
    }
}
