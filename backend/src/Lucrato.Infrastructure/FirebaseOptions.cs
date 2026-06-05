namespace Lucrato.Infrastructure;

/// <summary>Bound from configuration section "Firebase".</summary>
public sealed class FirebaseOptions
{
    /// <summary>GCP / Firebase project id. Defaults to the Lucrato project.</summary>
    public string ProjectId { get; set; } = "lucrato-web";

    // Credentials come from Application Default Credentials: the Cloud Run runtime service account
    // in production, or the GOOGLE_APPLICATION_CREDENTIALS env var (service-account JSON) in local dev.
}
