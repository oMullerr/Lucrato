using Lucrato.Api.Auth;
using Lucrato.Application;
using Lucrato.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Lucrato.Api.Controllers;

[ApiController]
[Route("api/db")]
[Authorize]
public sealed class DbController : ControllerBase
{
    // Mirrors the list limits previously enforced by firestore.rules.
    private const int MaxPurchases = 20_000;
    private const int MaxSales = 40_000;

    private readonly IDatabaseRepository _repository;

    public DbController(IDatabaseRepository repository) => _repository = repository;

    /// <summary>Returns the authenticated user's full database (raw + computed + KPIs).</summary>
    [HttpGet]
    public async Task<ActionResult<ComputedDatabase>> Get(CancellationToken ct)
    {
        var db = await _repository.GetAsync(User.Uid(), ct);
        return Ok(DataComposition.Compose(db));
    }

    /// <summary>Overwrites the authenticated user's database. The backend is the sole writer.</summary>
    [HttpPut]
    public async Task<IActionResult> Put([FromBody] Database db, CancellationToken ct)
    {
        if (db is null) return BadRequest("Corpo ausente.");
        if (db.Purchases.Count > MaxPurchases) return BadRequest($"Limite de {MaxPurchases} compras excedido.");
        if (db.Sales.Count > MaxSales) return BadRequest($"Limite de {MaxSales} vendas excedido.");

        if (string.IsNullOrEmpty(db.Metadata.Versao)) db.Metadata.Versao = DatabaseDefaults.AppVersion;

        await _repository.SaveAsync(User.Uid(), db, ct);
        return NoContent();
    }
}
