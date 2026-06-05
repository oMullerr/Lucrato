using Lucrato.Domain;

namespace Lucrato.Application;

/// <summary>Persistence for the per-user database document (users/{uid}/db/main).</summary>
public interface IDatabaseRepository
{
    Task<Database> GetAsync(string uid, CancellationToken ct = default);
    Task SaveAsync(string uid, Database db, CancellationToken ct = default);
}

/// <summary>Authenticated Firebase user resolved from an ID token.</summary>
public sealed record FirebaseUser(string Uid, string? Email, bool EmailVerified);

/// <summary>Verifies Firebase ID tokens. Implemented in Infrastructure via the Admin SDK.</summary>
public interface IFirebaseTokenVerifier
{
    Task<FirebaseUser> VerifyAsync(string idToken, CancellationToken ct = default);
}
