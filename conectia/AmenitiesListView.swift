import SwiftUI
import Combine

struct AmenitiesListView: View {
    let buildingId: String
    @State private var amenities: [Amenity] = []
    @State private var isLoading = true
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando amenities...")
            } else if amenities.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "sportscourt")
                        .font(.system(size: 50))
                        .foregroundColor(.gray)
                    Text("No hay amenities disponibles en este edificio.")
                        .foregroundColor(.secondary)
                }
            } else {
                List {
                    ForEach(amenities) { amenity in
                        NavigationLink {
                            BookAmenityView(amenity: amenity)
                        } label: {
                            HStack {
                                Image(systemName: "sportscourt.fill")
                                    .foregroundColor(.purple)
                                    .frame(width: 32)
                                Text(amenity.name)
                                    .font(.headline)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
        }
        .navigationTitle("Amenities")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink("Mis Reservas") {
                    MyReservationsView()
                }
            }
        }
        .onAppear {
            loadAmenities()
        }
    }

    private func loadAmenities() {
        isLoading = true
        FirestoreService.shared.listenAmenities(buildingId: buildingId)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { items in
                self.amenities = items
                self.isLoading = false
            })
            .store(in: &cancellables)
    }
}
