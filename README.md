# agentic-orchestra

[OMP](https://github.com/) için çok-ajanlı (multi-agent) orkestra paketi:
10 görev ajanı + 2 skill prosedürü + bunları doğru yere koyan kurulum betiği.

Kök oturum (conductor) işi parçalara böler, her parçayı tek bir uzman role
verir, sonra kendisi doğrular. Uzmanlar kendi başlarına iş yapmaz; her biri
tek bir sorumluluğa sahiptir ve kanıtla geri döner.

> Depo adındaki sondaki tire gerçektir: `agentic-orchestra-`.
> tiresiz ad 404 verir.

## İçerik

```
agents/                       10 görev ajanı (OMP agent formatı)
  luna-explorer.md            keşif          · read-only · 272K
  luna-researcher.md          araştırma      · read-only · 272K
  luna-worker.md              implementasyon · yazma     · 272K
  luna-tester.md              test           · yazma     · 272K
  luna-reviewer.md            inceleme       · read-only · 272K
  space-bunny-worker.md       implementasyon · yazma     · 1M
  space-bunny-reviewer.md     inceleme       · read-only · 1M
  antigravity-gemini-explorer.md  keşif     · read-only · 1M
  antigravity-sonnet-worker.md    implem.   · yazma     · 250K
  antigravity-opus-reviewer.md    inceleme  · read-only · 250K

skills/                       2 skill prosedürü (SKILL.md)
  graft/                      kod grafiğinden bağlam/çağrı/blast-radius sorgulama
  sol-luna-orchestrator/      topoloji, yönlendirme tablosu, delegasyon kuralları

install.sh                    idempotent kurulum betiği (--dry-run, --force, --project)
docs/
  architecture.md             katmanlar, roller, model kablolaması
  skills-reference.md         15 referansın hangisi var, hangisi yok
  troubleshooting.md          gözlenmiş sorunlar ve teşhis komutları
```

## Gereksinimler

- **OMP v18+** (`omp --version` → `v18.3.2` ile doğrulandı)
- Ajanların pinlediği model sağlayıcılarından en az birine erişim
  (`omp login`)
- `graft` skill'i için **isteğe bağlı**: graft indeksi (`graft/`) ya da graft MCP
  sunucusu. Yoksa skill zarar görmez, ajan grep/`read`'e düşer.

## Kurulum

### Yöntem 1 — kurulum betiği (önerilen)

```bash
git clone https://github.com/dontworryplz/agentic-orchestra-.git
cd agentic-orchestra-

./install.sh --dry-run     # önce ne yapacağını göster
./install.sh               # kur
```

Betik nereye yazar:

| Kapsam | Ajanlar | Skill'ler |
|---|---|---|
| `--user` (varsayılan) | `~/.omp/agent/agents/` | `~/.omp/skills/` |
| `--project` | `./.omp/agents/` | `./.omp/skills/` |

Bayraklar:

| Bayrak | Etki |
|---|---|
| `--dry-run` | hiçbir şey yazmaz, yalnızca planı gösterir |
| `--force` | var olan dosyaların üzerine yazar |
| `--user` / `--project` | hedef kapsam |
| `--agents-only` / `--skills-only` | sadece bir kısmı kurar |
| `-h` | yardım |

Betik **idempotenttir**: aynı dosyayı ikinci kez kurmaz, sessizce atlar.
Farklı bir dosya varsa üzerine yazmaz, uyarır ve `--force` ister. Yani
`~/.omp/agent/agents` elinizdeki düzenlemeleri koruyan bir dağıtım hedefi olarak
çalışır.

`PI_CODING_AGENT_DIR` ayarlıysa onu taban alır.

### Yöntem 2 — manuel

```bash
AGENTS=~/.omp/agent/agents
SKILLS=~/.omp/skills
mkdir -p "$AGENTS" "$SKILLS"

cp agents/*.md            "$AGENTS"/
cp -R skills/graft         "$SKILLS"/
cp -R skills/sol-luna-orchestrator "$SKILLS"/
```

Proje kapsamı için `~/.omp/...` yerine `./.omp/...` kullanın.

### Yöntem 3 — OMP skill kaydı

```bash
omp skill install ./skills/graft
omp skill install ./skills/sol-luna-orchestrator
```

> Bu yöntem `omp skill --help` metnine göre yazılmıştır ( hedef türü
> "directories" olarak listeleniyor) ama **bu makinede çalıştırılarak
> doğrulanmadı**. Yöntem 1 ve 2 doğrulandı.

## Doğrulama

```bash
# 1. Dosyalar yerinde mi?
ls ~/.omp/agent/agents/{luna,space-bunny,antigravity}-*.md | wc -l   # 10
ls ~/.omp/skills                        # graft, sol-luna-orchestrator

# 2. OMP gerçekten keşfediyor mu? (canlı çalıştırma, API çağrısı yapar)
omp --skills='graft,sol-luna-orchestrator' -p "list your available skills"

# 3. Ajan rolleri çözümleniyor mu?
omp -p "list your available task agents"

# 4. Model ID'leri geçerli mi?
omp models | grep -E 'gpt-6-luna|gpt-6-sol|space-bunny-alpha|gemini-3.8-flash|opus-4-6|sonnet-4-6'
```

4. adımda beklenen çıktı: `gpt-6-luna`, `gpt-6-sol`,
`stealth/space-bunny-alpha`, `gemini-3.8-flash`, `claude-opus-4-6`,
`claude-sonnet-4-6` — hepsi bulunmalı.

## Model yapılandırması

Ajanların `model:` satırları tek başına yeterli değildir. `~/.omp/agent/config.yml`
içindeki `task.agentModelOverrides` da rol bazlı pin uygular ve **ikisi
çelişebilir**. Kurulum sırasında ölçülen fark:

| Rol | `config.yml` | ajan frontmatter |
|---|---|---|
| `luna-*` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `space-bunny-*` | tanımlı değil | `stealth/space-bunny-alpha` |

Hangisinin kazandığını tahmin etmeyin. `docs/architecture.md` bu konunun tam
anlatımını, `docs/troubleshooting.md` ise teşhis komutlarını içerir.

Kendi pinlerinizi eklemek isterseniz `config.yml`'e:

```yaml
task:
  maxConcurrency: 4
  agentModelOverrides:
    luna-worker: openai-codex/gpt-6-luna:max
    space-bunny-reviewer: stealth/space-bunny-alpha
```

## Kaldırma

```bash
rm ~/.omp/agent/agents/{luna,space-bunny,antigravity}-*.md
rm -rf ~/.omp/skills/{graft,sol-luna-orchestrator}
```

## Bilinen sınır: 14 skill eksik

Ajan gövdesi 15 skill'e yönlendirme yapıyor; bu depoda 2 tanesi var. Kalan 14'ü
için ajan, prosedürü yükleyemediğinde uydurma riski taşır. Hangilerinin bu
makinede başka bir yerde bulunduğu ve seçeneklerin ne olduğu
`docs/skills-reference.md` içinde.

## Uyumluluk notu

Bu depodaki ajanlar **OMP formatındadır** (`tools:` virgüllü liste,
`read-summarize:`). OpenCode'un ajan şeması farklıdır (`mode`, `temperature`,
`steps`, `permission`). Dosyaları doğrudan kopyalamak çalışmaz — ayrıntı ve
çeviri tablosu `docs/troubleshooting.md` içinde.

## Lisans

Boost Software License 1.0 — bkz. [LICENSE](LICENSE).
