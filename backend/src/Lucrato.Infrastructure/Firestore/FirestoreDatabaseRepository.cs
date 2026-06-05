using Google.Cloud.Firestore;
using Lucrato.Application;
using Lucrato.Domain;

namespace Lucrato.Infrastructure.Firestore;

/// <summary>
/// Reads/writes the single per-user document at users/{uid}/db/main via the Firestore Admin SDK.
/// The Admin SDK bypasses Firestore security rules, so all access control happens in the API.
/// </summary>
public sealed class FirestoreDatabaseRepository : IDatabaseRepository
{
    private readonly FirestoreDb _db;

    public FirestoreDatabaseRepository(FirestoreDb db) => _db = db;

    private DocumentReference DocFor(string uid) => _db.Collection("users").Document(uid).Collection("db").Document("main");

    public async Task<Database> GetAsync(string uid, CancellationToken ct = default)
    {
        var snapshot = await DocFor(uid).GetSnapshotAsync(ct);
        if (!snapshot.Exists) return DatabaseDefaults.CreateEmpty();
        return snapshot.ConvertTo<DatabaseDoc>().ToDomain();
    }

    public async Task SaveAsync(string uid, Database db, CancellationToken ct = default)
    {
        db.Metadata.UltimaAtualizacao = DateTimeOffset.UtcNow.ToString("o");
        await DocFor(uid).SetAsync(DatabaseDoc.From(db), SetOptions.Overwrite, ct);
    }
}
