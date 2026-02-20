import Foundation
import Combine
import UIKit

@MainActor
final class TicketsViewModel: ObservableObject {
    @Published var tickets: [Ticket] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private var cancellables = Set<AnyCancellable>()
    private let fs = FirestoreService.shared

    func startListening(userId: String, isAdmin: Bool, buildingId: String?) {
        cancellables.removeAll()
        let publisher: AnyPublisher<[Ticket], Error> = isAdmin ? fs.listenAllTickets(buildingId: buildingId) : fs.listenTicketsForUser(userId, buildingId: buildingId)
        publisher
            .receive(on: RunLoop.main)
            .sink { [weak self] completion in
                if case .failure(let error) = completion {
                    self?.errorMessage = error.localizedDescription
                }
            } receiveValue: { [weak self] items in
                self?.tickets = items
            }
            .store(in: &cancellables)
    }

    func createTicket(title: String, message: String, priority: TicketPriority, images: [UIImage], permission: Bool? = nil, window: String? = nil) async -> Result<Void, Error> {
        guard let uid = AuthService.shared.currentUserUID else {
            return .failure(NSError(domain: "TicketsViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Usuario no autenticado"]))
        }
        do {
            var attachmentURLs: [String] = []
            for (index, img) in images.enumerated() {
                let path = "tickets/\(uid)/\(UUID().uuidString)_\(index).jpg"
                let url = try await StorageService.shared.uploadUIImage(img, path: path)
                attachmentURLs.append(url.absoluteString)
            }
            
            // TODO: In a real app we would fetch the user's buildingId and unitId here or from SessionManager
            let ticket = Ticket(
                id: nil,
                userId: uid,
                buildingId: nil,
                unitId: nil,
                title: title,
                message: message,
                status: .open,
                priority: priority,
                attachmentURLs: attachmentURLs,
                permissionToEnter: permission,
                preferredEntryTime: window,
                assignedAdminId: nil,
                createdAt: nil,
                updatedAt: nil
            )
            _ = try await FirestoreService.shared.createTicket(ticket)
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    func updateStatus(ticket: Ticket, to status: TicketStatus) async -> Result<Void, Error> {
        guard let id = ticket.id else { return .failure(NSError(domain: "TicketsViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Ticket inválido"])) }
        var updated = ticket
        updated.status = status
        do {
            try await FirestoreService.shared.updateTicket(id: id, ticket: updated)
            return .success(())
        } catch {
            return .failure(error)
        }
    }
}
