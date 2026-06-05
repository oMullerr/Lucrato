using FirebaseAdmin;
using FirebaseAdmin.Auth;
using Google.Apis.Auth.OAuth2;
using Lucrato.Application;
using Microsoft.Extensions.Options;

namespace Lucrato.Infrastructure.Auth;

/// <summary>Verifies Firebase ID tokens with the Admin SDK and enforces e-mail verification.</summary>
public sealed class FirebaseTokenVerifier : IFirebaseTokenVerifier
{
    private readonly Lazy<FirebaseAuth> _auth;

    public FirebaseTokenVerifier(IOptions<FirebaseOptions> options)
    {
        // Lazy so the process can start (and serve /health) without credentials present;
        // ADC is only resolved the first time a token is actually verified.
        _auth = new Lazy<FirebaseAuth>(() =>
        {
            var opts = options.Value;
            var app = FirebaseApp.DefaultInstance ?? FirebaseApp.Create(new AppOptions
            {
                Credential = GoogleCredential.GetApplicationDefault(),
                ProjectId = opts.ProjectId,
            });
            return FirebaseAuth.GetAuth(app);
        });
    }

    public async Task<FirebaseUser> VerifyAsync(string idToken, CancellationToken ct = default)
    {
        var token = await _auth.Value.VerifyIdTokenAsync(idToken, ct);
        token.Claims.TryGetValue("email", out var email);
        token.Claims.TryGetValue("email_verified", out var verified);
        return new FirebaseUser(
            Uid: token.Uid,
            Email: email as string,
            EmailVerified: verified is bool b && b);
    }
}
