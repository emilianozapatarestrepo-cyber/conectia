import Foundation
import FirebaseStorage
import UIKit

final class StorageService {

    static let shared = StorageService()
    private init() {}

    private let storage = Storage.storage()

    func uploadImage(data: Data, path: String, contentType: String = "image/jpeg") async throws -> URL {
        let ref = storage.reference(withPath: path)
        let metadata = StorageMetadata()
        metadata.contentType = contentType

        // Compatibilidad amplia: closures + continuations
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            ref.putData(data, metadata: metadata) { _, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }

        let url: URL = try await withCheckedThrowingContinuation { continuation in
            ref.downloadURL { url, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: NSError(
                        domain: "StorageService",
                        code: -2,
                        userInfo: [NSLocalizedDescriptionKey: "No se pudo obtener la URL de descarga"]
                    ))
                }
            }
        }
        return url
    }

    func uploadUIImage(_ image: UIImage, path: String, quality: CGFloat = 0.8) async throws -> URL {
        guard let data = image.jpegData(compressionQuality: quality) else {
            throw NSError(domain: "StorageService", code: -1, userInfo: [NSLocalizedDescriptionKey: "No se pudo convertir la imagen a JPEG"])
        }
        return try await uploadImage(data: data, path: path)
    }

    func delete(at path: String) async throws {
        let ref = storage.reference(withPath: path)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            ref.delete { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    func downloadURL(forPath path: String) async throws -> URL {
        let ref = storage.reference(withPath: path)
        return try await withCheckedThrowingContinuation { continuation in
            ref.downloadURL { url, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: NSError(
                        domain: "StorageService",
                        code: -2,
                        userInfo: [NSLocalizedDescriptionKey: "No se pudo obtener la URL de descarga"]
                    ))
                }
            }
        }
    }
}
