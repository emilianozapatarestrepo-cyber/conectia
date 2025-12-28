import SwiftUI

struct TicketDetailView: View {
    let ticket: Ticket

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(ticket.title)
                        .font(.title2)
                        .fontWeight(.bold)
                    Spacer()
                    statusBadge(ticket.status)
                }
                Text(ticket.message)
                    .font(.body)

                if !ticket.attachmentURLs.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Adjuntos").font(.headline)
                        ForEach(ticket.attachmentURLs, id: \.self) { urlString in
                            if let url = URL(string: urlString) {
                                Link(destination: url) {
                                    Label("Ver archivo", systemImage: "paperclip")
                                }
                            }
                        }
                    }
                }
                Spacer()
            }
            .padding()
        }
        .navigationTitle("Detalle")
    }

    private func statusBadge(_ status: TicketStatus) -> some View {
        let text: String
        let color: Color
        switch status {
        case .open: text = "Abierto"; color = .orange
        case .inReview: text = "En revisión"; color = .blue
        case .resolved: text = "Resuelto"; color = .green
        }
        return Text(text)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .foregroundColor(color)
            .cornerRadius(8)
    }
}

