# Skill referansı

## Bu depoda gelenler

| Skill | Ne yapar | Ne zaman tetiklenir |
|---|---|---|
| [`graft`](../skills/graft/SKILL.md) | `graft/` kod grafiğini sorgular: bağlam, çağrı izleri, blast radius, dosya API'si. | Graf indeksi olan bir repoda, grep/okumadan önce. Preflight `graft/` dizinini veya graft MCP sunucusunu doğrular; ikisi de yoksa skill geçerli değildir. |
| [`sol-luna-orchestrator`](../skills/sol-luna-orchestrator/SKILL.md) | Conductor/specialist topolojisi, görev→rol yönlendirme tablosu, delegasyon ve yetki sınırları. | Kök oturumda iş dağıtımı yapılacağı zaman. |

## Ajanların referans verdiği ama bu depoda olmayan skill'ler

Ajan gövdeleri `skill://<ad>` ile 15 skill'e yönlendirme yapıyor. Bunların 2'si
yukarıda geliyor; **14'ü bu depoda yok**. Bu, kasıtlı bir eksik değil: bu depo
küçük ve bağımsız tutuldu. Ama bu yönlendirmeleri okuyan bir ajan, skill
bulamazsa **prosedürü uydurmak zorunda kalır** — bu da en pahalı hata sınıfı.

Aşağıdaki tablo bu boşluğun haritasıdır. "Kaynak" sütunu, o skill'in bu makinede
başka bir yerde mevcut olup olmadığını gösterir; bulunması, OMP'nin onu
otomatik yükleyeceği anlamına gelmez, yalnızca taşınabileceği bir kaynaktır.

| Skill | Ajanlar | Durum | Yerel kaynak |
|---|---|---|---|
| `caveman` | tüm ajanlar | taşınabilir | `~/.agents/skills/caveman`, `~/.config/opencode/skills/caveman` |
| `codebase-memory` | keşif rolü | taşınabilir | `~/.agents/skills/codebase-memory` |
| `context7-mcp` | araştırma rolü | taşınabilir | `~/.agents/skills/context7-mcp` |
| `gitnexus-exploring` | keşif rolü | taşınabilir | `~/.config/opencode/skills/gitnexus-exploring` |
| `gsd-code-review` | inceleme rolleri | taşınabilir | `~/.agents/skills/gsd-code-review` |
| `no-ai-slop` | tüm ajanlar | taşınabilir | `~/.omp/skills/no-ai-slop` (OMP'de kurulu) |
| `context-fetch` | keşif, araştırma | **yok** | — |
| `debug-issue` | keşif, implementasyon, test | **yok** | — |
| `empirical-validation` | 5 rol | **yok** | — |
| `eresus-guard` | 3 inceleme rolü | **yok** | — |
| `executor` | implementasyon, test | **yok** | — |
| `refactor-safely` | implementasyon rolleri | **yok** | — |
| `review-changes` | 3 inceleme rolü | **yok** | — |
| `verifier` | test rolü | **yok** | — |

`skills/sol-luna-orchestrator/SKILL.md` ayrıca `eresus-autonomous`'a atıf
yapıyor; o da bu depoda yok.

## Opsiyonel bağımlılıklar

Bu skill'ler **harici bir araca** bağlıdır; dosyayı kopyalamak yetmez.

| Skill | Gereken dış arayüz | Kurulum |
|---|---|---|
| `graft` | `graft/` indeksi **veya** graft MCP sunucusu | graft binary'si PATH'te olmalı, ya da MCP sunucusu config'de tanımlı olmalı |
| `codebase-memory` | `codebase-memory-mcp` MCP sunucusu | OpenCode/OMP MCP config'ine eklenmeli |
| `gitnexus-exploring` | `gitnexus` CLI veya MCP | ayrı indeksleme adımı gerekir |
| `context7-mcp` | context7 MCP sunucusu | MCP config'ine eklenmeli |

Ajan gövdesi bu ayrımı bilmez; `graft` skill'i kendi preflight'ını içerir,
diğerleri için `docs/troubleshooting.md` bak.

## Eksik skill'ler için tavsiye

Üç seçenek, artan değere göre:

1. **Kopyalama.** `~/.omp/skills/<ad>/` altına `SKILL.md` kopyalayın. Hızlı,
   ama kaynak güncellenmez.
2. **Sembolik bağ.** `ln -s ~/.agents/skills/<ad> ~/.omp/skills/<ad>`. Tek
   `pull` ile tüm repolar güncellenir. `znut/agent-skills` bu yaklaşımı
   öneriyor.
3. **Referansı kaldırma.** Skill'i depoya yazmayacaksanız, ajan gövdesindeki
   `skill://<ad>` satırını kaldırın. Var olmayan bir prosedüre yönlendirme,
   hiç yönlendirme olmamasından kötüdür: ajan adı geçerli göründüğü için
   uydurur.
