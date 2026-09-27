# Mimari

## Katmanlar

```
root session (conductor)          task[] (uzmanlar)              skill:// (prosedür)
─────────────────────────         ──────────────────────         ────────────────────
openai-codex/gpt-6-sol     →     luna-*          (5 rol)    →    graft
                                  space-bunny-*   (2 rol)         sol-luna-orchestrator
                                  antigravity-*   (3 rol)
```

- **Conductor** yorumlama, mimari, dilimleme, arayüz sözleşmeleri, entegrasyon,
  son doğrulama ve teslim sahibidir. Uzmanlara iş dağıtır, işi onların adına
  yapmaz.
- **Uzmanlar** tek bir rolü üstlenir: keşif, araştırma, implementasyon, test
  veya bağımsız inceleme. Hepsi `Sol orchestrator`'a raporlar.
- **Skill'ler** etiket değil, çalıştırılabilir prosedürdür. Ajan gövdesi
  `skill://<ad>` ile yönlendirir; skill dosyası prosedürü tanımlar.

## Ajan rolleri

| Rol | Dosya | Model | Araçlar | Ne zaman |
|---|---|---|---|---|
| Keşif | `agents/luna-explorer.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, lsp, web_search | sembol bul, akış çıkar, bağımlılık haritala |
| Araştırma | `agents/luna-researcher.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, web_search | güncel API/davranış, birincil kaynak doğrulama |
| Implementasyon | `agents/luna-worker.md` | `openai-codex/gpt-6-luna:max` | + edit, write | sahipliği daraltılmış kod dilimi |
| Test | `agents/luna-tester.md` | `openai-codex/gpt-6-luna:max` | + edit, write | repro, hedefli test, kanıt üret |
| İnceleme | `agents/luna-reviewer.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, lsp, bash | bağımsız doğruluk/güvenlik kapısı |
| Uzun bağlamlı implementasyon | `agents/space-bunny-worker.md` | `stealth/space-bunny-alpha` | + edit, write | tek geçişe sığmayan dilim (1M) |
| Uzun bağlamlı inceleme | `agents/space-bunny-reviewer.md` | `stealth/space-bunny-alpha` | read, grep, glob, lsp, bash | tek geçişe sığmayan inceleme (1M) |
| Antigravity keşif | `agents/antigravity-gemini-explorer.md` | `google-antigravity/gemini-3.8-flash:high` | read, grep, glob, lsp, bash | büyük salt-okunur okuma kümesi (1M) |
| Antigravity implementasyon | `agents/antigravity-sonnet-worker.md` | `google-antigravity/claude-sonnet-4-6:high` | + edit, write | paralel, dosya-kesişimsiz dilim (250K) |
| Antigravity inceleme | `agents/antigravity-opus-reviewer.md` | `google-antigravity/claude-opus-4-6:high` | read, grep, glob, lsp, bash | yüksek riskli akış için ikinci görüş (250K) |

Tüm model ID'leri `omp models` çıktısıyla doğrulanmıştır (bkz. README "Doğrulama").

## Yönlendirme kuralı

Görev, bağlam penceresinden başlar. 272K'ya sığan bir iş için `luna-*` her
zaman daha ucuz ve hızlıdır. `space-bunny-*` ve `antigravity-*` yalnızca iki
durumda devreye girer:

1. Okuma kümesi tek geçişe sığmıyorsa (1M modeller).
2. Tartışmalı bir tasarım için ikinci bir tedarikçinin görüşü gerekiyorsa.

"Tedarikçi kataloğunda var" bir görevlendirme gerekçesi değildir. Gerekçe
beceri ihtiyacı ve doğrulanmış bir agent rolüdür.

## Model kablolaması — iki kaynak, tek doğruluk yolu

Model pinleri **iki ayrı yerde** tanımlıdır ve bunlar çelişebilir:

1. `~/.omp/agent/config.yml`
   - `modelRoles` → kök roller (`plan`, `slow`, `smol`, `task`, `commit`, ...)
   - `task.agentModelOverrides` → rol bazlı alt ajan pinleri
2. `agents/*.md` frontmatter → her dosyanın `model:` satırı

Örnek gözlem (kurulum anında ölçüldü, `gpt-6`/`gpt-5.6` sürüm farkı):

| Rol | `config.yml` `agentModelOverrides` | agent frontmatter |
|---|---|---|
| `luna-explorer` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `luna-worker` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `luna-reviewer` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `space-bunny-*` | *(tanımlı değil)* | `stealth/space-bunny-alpha` |

Hangisinin kazandığı runtime'ın işidir, tahmin edilmez. Bu yüzden
`skills/sol-luna-orchestrator/SKILL.md` içindeki preflight, yönlendirmeden
önce **her iki dosyayı da okumayı** zorunlu kılar: iki ID farklıysa ikisini de
bildir ve hangisinin gerçekten çalıştığını bir `task` sonucuyla doğrula.

## Eşzamanlılık

`config.yml` → `task.maxConcurrency: 4`. Aynı anda en fazla dört alt ajan.
Kural: dosya/subsystem başına tek yazar. Ortak dosya mutasyonu entegrasyon
sahibine serileştirilir. Eşzamanlı ajanlar formatter, linter, build ve
proje-geneli test çalıştırmaz; conductor entegrasyon sonrası doğrulamayı
üstlenir.

## Yetki sınırları

Hiçbir uzman ajan genişletilmiş bir yetkiye sahip değildir:

- Salt-okunur roller (`luna-explorer`, `luna-researcher`, `luna-reviewer`,
  `space-bunny-reviewer`, 3 `antigravity-*` keşif/inceleme) `edit`/`write`
  içermez.
- Yazma rolleri yalnızca açıkça sahiplendirilen dosyalara dokunur.
- Hiçbir ajan `stage` veya `commit` çağırmaz; bu conductor'ın işidir.
- Tüm roller "raporladıktan sonra dur" disipliniyle çalışır; asla teslim
  iddiasında bulunmaz.
