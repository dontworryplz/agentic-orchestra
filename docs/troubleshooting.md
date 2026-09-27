# Sorun giderme

Buradaki her madde bu depoyu kurarken gözlenmiş, tahmin edilmemiş bir
durumdan çıkarıldı.

## "agentic-orchestra" 404 veriyor

Depo adında **sondaki tire gerçek**: `dontworryplz/agentic-orchestra-`.
Tiresiz ad (`agentic-orchestra`) GitHub'da çözünmez.

```bash
git clone https://github.com/dontworryplz/agentic-orchestra-.git
```

## `omp agents unpack` editlediğin ajan dosyalarını eziyor

`omp agents unpack --user --force`, `~/.omp/agent/agents/*.md` dosyalarının
üzerine yazar. Elle düzenlediğiniz ajan tanımı bu komutla kaybolur.

Bu yüzden ajanlar bu depoda versiyonlanır. Kurulumdan sonra
`~/.omp/agent/agents` bir **dağıtım hedefidir**, kaynak değil.

## Ajan çalışıyor ama model beklediğin değil

Model pinleri iki yerde tanımlı ve çelişebiliyor:

- `~/.omp/agent/config.yml` → `task.agentModelOverrides`
- `agents/*.md` → frontmatter `model:`

Kurulum anında ölçülen fark: `luna-*` rolleri config'de
`openai-codex/gpt-5.6-luna:max`, ajan dosyalarında
`openai-codex/gpt-6-luna:max` idi. Hangisinin uygulandığını **tahmin etmeyin**:

```bash
grep -A20 'agentModelOverrides' ~/.omp/agent/config.yml
grep -h '^model:' ~/.omp/agent/agents/luna-*.md
omp models | grep -E 'gpt-[56](\.6)?-luna'
```

İkisi farklıysa ikisini de bildirin ve hangisinin çalıştığını gerçek bir
`task` sonucuyla doğrulayın. `space-bunny-*` rolleri config'te hiç tanımlı
değildir; yalnızca frontmatter pinleri vardır.

## `graft` skill'i çalışmıyor

`graft` skill'i **koşulludur**: repo kökünde `graft/` dizini ya da graft MCP
sunucusu yoksa uygulanacak bir aracı yoktur. Bu skill'i taşımak, aracı
taşımaz.

Kurulum sırasında gözlenen durum: `graft` binary'si PATH'te değildi ve
`graft/` indeksi yalnızca tek bir repoda (`~/eresus-guard`) vardı. Yani bu
makinedeki çoğu repoda bu skill'in karşılığı `codebase-memory-mcp`'dir.

Kontrol:

```bash
ls -d graft 2>/dev/null || echo 'bu repo graft-indexed değil'
command -v graft || echo 'graft CLI yok'
```

İkisi de yoksa ajanın `graft` yönlendirmesine uyması beklenmemeli; skill
preflight'ı bu durumda grep/`read`'e düşmeyi söyler.

## Skill kurulu ama ajan "skill bulamadım" diyor

İki ayrı skill dizini taranır ve ikisi de geçerlidir:

- `~/.omp/skills/<ad>/SKILL.md` — kullanıcı global skill'leri (kurulum
  hedefi budur)
- `~/.omp/agent/managed-skills/<ad>/SKILL.md` — `PI_CODING_AGENT_DIR` altındaki
  yönetilen skill'ler

Kurulum betiği `~/.omp/skills/` hedefini kullanır çünkü `omp agents unpack`
yalnızca `agents/` dizinine dokunur; skills dizinine dokunmaz.

Doğrulama:

```bash
ls ~/.omp/skills
omp --skills='graft,sol-luna-orchestrator' -p 'list your available skills'
```

Tüm skill keşfini kapatmak için `--no-skills`, yalnız bir alt küme yüklemek
için `--skills='git-*,docker'` kullanılır.

## Bu dosyaları OpenCode'a kopyaladım, ajanlar görünmüyor

**Ajan dosya formatları runtime'lar arası uyumsuzdur.** Kopyalamak çalışmaz.

OMP agent frontmatter'ı:

```yaml
tools: read, grep, glob, lsp, bash, edit, write   # virgüllü liste
read-summarize: false
```

OpenCode agent frontmatter'ı:

```yaml
mode: primary
temperature: 0.2
steps: 50
permission:
  "*": deny
  read: allow
```

Aynı `.md` uzantısı, iki farklı şema. OpenCode tarafına aktaracaksanız
`tools` listesini `permission` haritasına çevirmeniz ve `read-summarize`
alanını düşürmeniz gerekir.

## `install.sh` hiçbir şey yazmıyor

Bilerek. Var olan dosyaların üzerine yazmaz; farklı bir dosya varsa sadece
uyarır. Üzerine yazmak için:

```bash
./install.sh --force
```

Önce ne yapacağını görmek için:

```bash
./install.sh --dry-run
```

## Ajanlar `skill://` hedeflerini bulamıyor

14 skill bu depoda yok (bkz. `docs/skills-reference.md`). Ajan gövdesi skill'i
yükleyemediğinde prosedürü uydurma riski vardır. Seçenekler: skill'i
`~/.omp/skills/` altına kopyalayın, sembolik bağ kurun, ya da ajan gövdesindeki
referansı kaldırın.

## Kurulum hedefi başka bir dizin mi?

`PI_CODING_AGENT_DIR` çevre değişkeni tabanı değiştirir (varsayılan
`~/.omp/agent`). `install.sh` bu değişkeni okur:

```bash
PI_CODING_AGENT_DIR=/tmp/omp-test ./install.sh --dry-run
```
