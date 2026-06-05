using System.Security.Claims;
using System.Text.Encodings.Web;
using Lucrato.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Lucrato.Api.Auth;

public static class FirebaseAuth
{
    public const string Scheme = "Firebase";
}

/// <summary>
/// Authenticates requests by validating the "Authorization: Bearer &lt;Firebase ID token&gt;" header.
/// Rejects tokens whose e-mail is not verified (mirrors the frontend verifyEmailGuard + Firestore rules).
/// </summary>
public sealed class FirebaseAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly IFirebaseTokenVerifier _verifier;

    public FirebaseAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IFirebaseTokenVerifier verifier)
        : base(options, logger, encoder)
    {
        _verifier = verifier;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(header) || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();

        var idToken = header["Bearer ".Length..].Trim();
        if (string.IsNullOrEmpty(idToken))
            return AuthenticateResult.NoResult();

        FirebaseUser user;
        try
        {
            user = await _verifier.VerifyAsync(idToken, Context.RequestAborted);
        }
        catch (Exception ex)
        {
            return AuthenticateResult.Fail($"Token inválido: {ex.Message}");
        }

        if (!user.EmailVerified)
            return AuthenticateResult.Fail("E-mail não verificado.");

        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, user.Uid) };
        if (!string.IsNullOrEmpty(user.Email)) claims.Add(new Claim(ClaimTypes.Email, user.Email));

        var identity = new ClaimsIdentity(claims, FirebaseAuth.Scheme);
        var principal = new ClaimsPrincipal(identity);
        return AuthenticateResult.Success(new AuthenticationTicket(principal, FirebaseAuth.Scheme));
    }
}

public static class ClaimsPrincipalExtensions
{
    /// <summary>The authenticated Firebase uid, or throws if unauthenticated.</summary>
    public static string Uid(this ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("Requisição sem uid autenticado.");
}
