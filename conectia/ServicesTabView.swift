import SwiftUI
import Combine

struct ServicesTabView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var items: [MarketplaceItem] = []
    @State private var selectedSegment: Int = 0 // 0: Servicios, 1: Perks
    @State private var cancellables = Set<AnyCancellable>()
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Segmented Control Custom styled ideally, but standard picker for now
                Picker("Categoría", selection: $selectedSegment) {
                    Text("Servicios").tag(0)
                    Text("Beneficios").tag(1)
                }
                .pickerStyle(.segmented)
                .padding()
                .background(Color.cardBackground)
                
                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach(filteredItems) { item in
                            ServiceCard(item: item)
                        }
                    }
                    .padding()
                }
                .background(Color.backgroundBase)
            }
            .navigationTitle("Marketplace")
            .onAppear {
                loadMarketplace()
            }
        }
    }
    
    var filteredItems: [MarketplaceItem] {
        let type: MarketplaceType = selectedSegment == 0 ? .serviceVetted : .perk
        return items.filter { $0.type == type }
    }
    
    private func loadMarketplace() {
        let buildingId = session.currentUser?.buildingId
        FirestoreService.shared.listenMarketplace(buildingId: buildingId)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { self.items = $0 })
            .store(in: &cancellables)
    }
}

struct ServiceCard: View {
    let item: MarketplaceItem
    
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            // Image Placeholder
            ZStack {
                if let urlStr = item.imageURL, let url = URL(string: urlStr) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.gray.opacity(0.1)
                    }
                } else {
                    Rectangle().fill(Color.brandPrimary.opacity(0.05))
                    Image(systemName: item.type == .serviceVetted ? "wrench.and.screwdriver.fill" : "tag.fill")
                        .foregroundColor(item.type == .serviceVetted ? .brandPrimary : .brandSecondary)
                }
            }
            .frame(width: 90, height: 90)
            .cornerRadius(12)
            .clipped()
            
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(item.title)
                        .roundedFont(.headline, weight: .bold)
                        .foregroundColor(.textHeading)
                    
                    if item.type == .perk {
                        Spacer()
                        Text("%")
                            .font(.caption.bold())
                            .padding(6)
                            .background(Color.brandSecondary.opacity(0.1))
                            .foregroundColor(.brandSecondary)
                            .clipShape(Circle())
                    }
                }
                
                Text(item.description)
                    .font(.caption)
                    .foregroundColor(.textBody)
                    .lineLimit(2)
                
                if let price = item.priceInfo {
                    Text(price)
                        .roundedFont(.subheadline, weight: .semibold)
                        .foregroundColor(item.type == .perk ? .brandSecondary : .textHeading)
                        .padding(.top, 2)
                }
            }
            Spacer()
        }
        .padding()
        .softCardStyle()
    }
}
