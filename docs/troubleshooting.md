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

## `npx skills add` bu repoyu bulamıyor

Bulması gerekir. Konvansiyon `skills/<ad>/SKILL.md` ve bu depo ona uyuyor.
Çalışmıyorsa şunları kontrol et:

```bash
ls skills/*/SKILL.md            # her skill dizininde SKILL.md olmalı
npx skills add dontworryplz/agentic-orchestra- --list
```

Bu repo için doğrulanmış çıktı: yerel yoldan `Found 9 skills`, GitHub
yolundan (push sonrası) aynı. Eğer 0 skill buluyorsa `skills/` dizini
taşınmış ya da bir skill dizininde `SKILL.md` yok — `verify.sh` kontrol 13
ikisini de assert eder.

## `npx skills add` OMP'ye kurmuyor

Kurulmuyor, çünkü kuramaz: `skills` v1.7.0'nin agent tablosunda `omp` yok
(`opencode` ve `pi` var). Paket `PI_CODING_AGENT_DIR` de tanımıyor. OMP için
`npx agentic-orchestra install omp` ya da `./install.sh`.

## Aynı skill iki yerde kuruldu, hangisi geçerli?

`npx skills add` varsayılan olarak **sembolik bağ** kurar; `agentic-orchestra`
**kopyalar**. İkisi aynı anda çalışırsa hangisinin okunduğu belirsizleşir.

```bash
ls -la ~/.omp/skills/graft        # bağ mı, kopya mı?
npx skills add <repo> -g -y --copy   # kopyaya zorla
```

Tek yol seç. Sembolik bağı tercih ediyorsan ajanları ayrıca
`npx agentic-orchestra install <runtime> --skills-only` ile kurma.

## `npx` çalıştırıyor ama "import: command not found" diyor

`bin/*.mjs` dosyasının shebang'ı yok. Bu durumda npm bir sembolik bağ üretir,
kabuk onu bash olarak okur ve satır satır hata verir. Ayrıca exec biti de
gerekir.

```bash
head -1 bin/agentic-orchestra.mjs    # #!/usr/bin/env node olmalı
ls -l bin/agentic-orchestra.mjs     # -rwxr-xr-x olmalı
```

`verify.sh` kontrol 14 bunları assert eder; bu hatayı bir kez yaşadık.

## Bash ve Node dönüştürücüleri farklı ajan üretiyor

Olmamalı. `verify.sh` kontrol 12 ikisini byte-byte karşılaştırır. Kırmızıysa
eşlemelerden biri iki tarafta farklı kalmıştır.

```bash
./verify.sh 2>&1 | grep -A6 'converters disagree'
diff <(./install-opencode.sh --show luna-explorer 2>/dev/null) \
     <(node bin/agentic-orchestra.mjs show luna-explorer --runtime opencode 2>/dev/null)
```

Bu kontrol işe yaradı: ilk çalıştırmada Node tarafı `tools: ` (satır sonu
boşluğu) basarken bash `tools:` basıyordu. YAML'da bu ayrım ölümcüldü —
sonraki `webfetch: false`, önceki `webfetch: true`'yu ezerdi.

## OpenCode'da ajanlar görünmüyor ama dosyalar kopyalanmış

OpenCode'un agent şeması OMP'inkiyle aynı değil. Dönüştürücünün ürettiği
frontmatter şunu içerir:

```yaml
mode: subagent
tools:
  read: true
  write: false
```

`tools` virgüllü liste değil, anahtar-değer haritası olmalı. Elle kopyaladıysan
bu yüzden yüklenmiyordur. Dönüştürücüyü kullan:

```bash
./install-opencode.sh --show luna-worker
```
