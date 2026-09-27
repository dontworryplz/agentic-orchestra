# agentic-orchestra

[OMP](https://github.com/), OpenCode ve Claude Code için çok-ajanlı (multi-agent)
orkestra paketi: **10 görev ajanı + 9 skill prosedürü + 4 kurulum/kaldırma
betiği + bir doğrulama harness'ı**.

Kök oturum (conductor) işi parçalara böler, her parçayı tek bir uzman role
verir, sonra kendisi doğrular. Uzmanlar kendi başlarına iş yapmaz; her biri
tek bir sorumluluğa sahiptir ve kanıtla geri döner.

> Depo adındaki sondaki tire gerçektir: `agentic-orchestra-`.
> tiresiz ad 404 verir.

## İçerik

```
agents/                        10 görev ajanı (OMP agent formatı, kaynak format)
  luna-explorer.md             keşif           · read-only · 272K
  luna-researcher.md           araştırma       · read-only · 272K
  luna-worker.md               implementasyon  · yazma     · 272K
  luna-tester.md               test            · yazma     · 272K
  luna-reviewer.md             inceleme        · read-only · 272K
  space-bunny-worker.md        implementasyon  · yazma     · 1M
  space-bunny-reviewer.md      inceleme        · read-only · 1M
  antigravity-gemini-explorer.md   keşif      · read-only · 1M
  antigravity-sonnet-worker.md     implem.    · yazma     · 250K
  antigravity-opus-reviewer.md     inceleme   · read-only · 250K

skills/                        9 skill prosedürü (SKILL.md, runtime'lar arası aynı)
  sol-luna-orchestrator/       topoloji, yönlendirme tablosu, delegasyon kuralları
  context-fetch/               en ucuz yeterli yüzeyden başlayarak bağlam kontrolü
  debug-issue/                 repro → localize → açıkla → kökten düzelt → kanıtla
  empirical-validation/        kanıt merdiveni, yanlışlayma testi, reddedilen kanıtlar
  review-changes/              diff tabanı kurma, öncelik sırası, P0–P3, kendini çürütme
  executor/                    sahiplik sözleşmesi, dur ve bildir koşulları
  verifier/                    spec maddesi → yanlışlayan gözlem, 3 karar değeri
  refactor-safely/             patlama yarıçapı, genişlet/migre et/daralt
  graft/                       kod grafiğinden bağlam/çağrı/blast-radius sorgulama

package.json                   npx girişi (bin: agentic-orchestra) + skill metadata
bin/agentic-orchestra.mjs      install · uninstall · verify · list · show · doctor
lib/
  convert.mjs                  OMP → OpenCode / Claude Code dönüşümü
  frontmatter.mjs              bu dosyaların kullandığı YAML alt kümesi
  paths.mjs                    runtime dizin çözümlemesi
  verify.mjs                   değişmez kontrolleri (Node tarafı)

install.sh                     OMP için kurulum (idempotent, üsterine yazmaz)
install-opencode.sh            OMP → OpenCode dönüştürücü
install-claude.sh              OMP → Claude Code dönüştürücü
uninstall.sh                   kurulanı kaldırır; düzenlenmiş dosyalara dokunmaz
verify.sh                      14 kontrol + izole-HOME kurulum smoke testi

docs/
  architecture.md              katmanlar, roller, model kablolaması
  skills-reference.md          hangi skill var, hangisi eksik, neden
  unresolved-skills.txt        makine-okunur boşluk listesi (verify.sh okur)
  troubleshooting.md           gözlenmiş sorunlar ve teşhis komutları
AGENTS.md                      bu depoyu düzenleyen ajanlar için değişmezler
CHANGELOG.md
```

## Hızlı başlangıç

Sadece **skill** istiyorsan, ecosystem standardı yeter:

```bash
npx skills add dontworryplz/agentic-orchestra- -g
```

Skill **ve ajan** istiyorsan (ya da OMP'ye kuruyorsan):

```bash
npx agentic-orchestra install all
```

İkisi de aynı dosyaları kullanır; neyin hangi yolla gittiğine aşağıda bak.

## Kurulum

### İki yol, iki kapsam

Bu paket iki şey taşıyor ve ikisi için farklı yollar var:

| | Skill'ler (9) | Ajan tanımları (10) |
|---|---|---|
| `npx skills add` | ✅ | ❌ |
| `npx agentic-orchestra` | ✅ | ✅ |

**`npx skills add dontworryplz/agentic-orchestra-`**

[vercel-labs/skills](https://github.com/vercel-labs/skills) CLI'ı — agent
skill'leri için de-facto standart (Nutlope/hallmark da bunu kullanıyor; kendi
installer'ı yok). Repo'yu klonlar, `skills/` dizinini konvansiyona göre tarar,
seçtiğin agent'lara yerleştirir. Bu depoda ek bir şey yapman gerekmez.

```bash
npx skills add dontworryplz/agentic-orchestra- --list                    # ne var
npx skills add dontworryplz/agentic-orchestra- -g -y                     # global, hepsi
npx skills add dontworryplz/agentic-orchestra- -g -y -a opencode claude-code
npx skills add dontworryplz/agentic-orchestra- -g -y -s debug-issue     # tek skill
```

Bu yol 80'den fazla agent'ı kapsar (`opencode`, `claude-code`, `codex`,
`cursor`, `copilot`, `gemini-cli`, …) ve varsayılan **sembolik bağ** kurar.

**`npx agentic-orchestra`**

```bash
npx agentic-orchestra                      # bulunan her runtime'a kur
npx agentic-orchestra install omp          # sadece OMP
npx agentic-orchestra install all --dry-run
npx agentic-orchestra list                 # 10 ajan + 9 skill
npx agentic-orchestra show luna-worker --runtime opencode
npx agentic-orchestra doctor               # runtime'ları ve durumu göster
npx agentic-orchestra verify               # değişmezleri doğrula
npx agentic-orchestra uninstall omp
```

Bu yolun eklediği iki şey var:

1. **Ajan tanımları.** `skills` standardı skill taşır; görev ajanlarını
   taşıyan standart bir yol yok. Burada 10 rol geliyor.
2. **OMP desteği.** `skills` v1.7.0'nin agent tablosunda `omp` **yok** —
   `opencode` ve `pi` var, `omp` yok; paket de `PI_CODING_AGENT_DIR`'ı
   bilmiyor. OMP'nin dizinleri `~/.omp/skills` ve `~/.omp/agent/agents`.

**Hangisini seçmeliyim?**

| Durum | Yol |
|---|---|
| Sadece skill'ler, OpenCode/Claude/Codex/Cursor | `npx skills add` |
| OMP kullanıyorum | `npx agentic-orchestra` |
| Ajan rollerini de istiyorum | `npx agentic-orchestra` |
| `git clone` + script, sürüm kontrolü | `install.sh` |

> **İki yolu aynı skill için aynı anda kullanma.** `skills` varsayılan olarak
> sembolik bağ kurar, `agentic-orchestra` kopyalar. Aynı skill iki yerde iki
> farklı mekanizmayla durursa hangisinin geçerli olduğu belirsizleşir. Birini
> seç: ya `skills` + `--copy`, ya da `agentic-orchestra`.

### Repo içinden kurulum (klonlayarak)

```bash
git clone https://github.com/dontworryplz/agentic-orchestra-.git
cd agentic-orchestra-

./install.sh             # OMP
./install-opencode.sh    # OpenCode
./install-claude.sh      # Claude Code
./uninstall.sh --omp     # geri al
```

Bu dört betik ne bash ne Node bağımlılığı ister — `npx` kullanmak istemeyenler
için. Üçü de aynı sözleşmeyi uygular:

| Bayrak | Etki |
|---|---|
| `--dry-run` | hiçbir şey yazmaz, yalnızca planı gösterir |
| `--force` | var olan dosyaların üzerine yazar |
| `--user` (varsayılan) / `--project` | hedef kapsam |
| `--agents-only` / `--skills-only` | sadece bir kısmı kurar |
| `--show <agent>` | dönüşümü ekrana basar, yazmaz |
| `--temperature N` / `--steps N` | OpenCode knob'ları |
| `--model <inherit\|sonnet\|opus\|haiku>` | Claude Code `model:` alanı |

### Hedef dizinler

| Runtime | Ajanlar | Skill'ler |
|---|---|---|
| OMP | `~/.omp/agent/agents/` | `~/.omp/skills/` |
| OpenCode | `~/.config/opencode/agents/` | `~/.config/opencode/skills/` |
| Claude Code | `~/.claude/agents/` | `~/.claude/skills/` |

`--project` ile sırasıyla `./.omp/`, `./.opencode/`, `./.claude/` altına kurar.

### Betikler neden idempotent ve neden üstüne yazmıyor

Aynı dosyayı ikinci kez kurmaz, sessizce atlar. Farklıysa **üzerine yazmaz**,
uyarır ve `--force` ister. `~/.omp/agent/agents` bir kaynak değil, dağıtım
hedefidir; yerel düzenlemeni ezen bir kurulum aracı, hiç kurulum yapmamaktan
daha kötüdür. `uninstall.sh` de aynı sözleşmeyi ters yönde uygular: kurulduktan
sonra değiştirdiğin bir dosyayı silmez, raporlar.

Bu davranış `verify.sh` içinde bir testtir: izole bir HOME'ya kur, ikinci
çalıştırmada 19'unun da "identical, skipped" demesini, sonra bir dosyayı
değiştirip üçüncü çalıştırmada "exists and differs" deyip dosyayı korumasını
zorlar.

### Elle kurulum

```bash
AGENTS=~/.omp/agent/agents
SKILLS=~/.omp/skills
mkdir -p "$AGENTS" "$SKILLS"
cp agents/*.md    "$AGENTS"/
cp -R skills/*/   "$SKILLS/"
```
## Dönüştürücüler ne yapıyor ve ne yapmıyor

`agents/*.md` OMP formatındadır. Diğer runtime'lara kurarken:

| Alan | OMP | OpenCode | Claude Code |
|---|---|---|---|
| araçlar | `tools: read, grep, glob` (virgüllü liste) | `tools:` → `read: true` haritası | `tools: Read,Grep,Glob` (Title-case liste) |
| rol | — | `mode: subagent` | — |
| model | `openai-codex/gpt-6-luna:max` | **düşürülür** | `inherit` |
| ek | `read-summarize: false` | `temperature`, `steps` | `effort` |

İki kural, kural değil de kısıt:

1. **Model pin'i asla uydurulmaz.** OMP `provider/model:effort` biçiminde pin
   alır; OpenCode kısa takma ad (`haiku`), Claude Code dört değerlik bir enum
   (`inherit|sonnet|opus|haiku`) kabul eder. Ortak dil yoktur. Betikler OMP
   pin'ini **düşürüp her seferinde raporlar**; Claude tarafında `inherit`
   yazar. `verify.sh` bunu ayrı bir kontrol olarak zorlar.
2. **Salt-okunurluk dönüşümde korunur.** OpenCode çıktısında verilmeyen her
   kapasite açıkça `false` yazılır — `edit`/`write`/`patch` dahil. Bir keşif
   ajanının runtime varsayılanıyla yazma yetkisi kazanması sessiz bir
   yetki yükseltmesi olurdu.

`lsp` aracının OpenCode veya Claude Code karşılığı yok; düşürülür ve
raporlanır. `web_search` → OpenCode'da `webfetch`, Claude Code'da `WebSearch`.

Dönüşümü görmek için:

```bash
./install-opencode.sh --show luna-explorer
./install-claude.sh   --show luna-worker
```

## Doğrulama

### Paket kendi kendini doğrular

```bash
./verify.sh            # 11 kontrol, 13 assertion + izole-HOME kurulum smoke testi
./verify.sh --fast     # smoke testleri atla (7 kontrol)
./verify.sh --quiet    # sadece hataları yaz
```

Kontrollerin her biri, `AGENTS.md`'de yazılı değişmezi bir assertion'a
çeviriyor:

| # | Kontrol | Nasıl kırılır |
|---|---|---|
| 1 | Frontmatter var | bir dosyanın açılış `---`'unu sil |
| 2 | `name` yoluyla uyuşuyor | dosyayı yeniden adlandır, frontmatter'ı değiştirme |
| 3 | `skill://` referansları çözülüyor ya da beyan edilmiş boşluk | uydurma bir skill adı ekle |
| 4 | Runtime dosyaları İngilizce | bir ajana Türkçe cümle ekle |
| 5 | Salt-okunur rol yazma yetkisi taşımıyor | keşif ajanına `edit` ekle |
| 6 | Placeholder yok | `TODO` ekle |
| 7 | Kabuk sözdizimi | bir betikte tırnak dengesizliği |
| 8 | Dönüşümde yinelenen YAML anahtarı yok | iki OMP aracını tek OpenCode anahtarına eşle, dedupe etme |
| 9 | Her ajan her runtime'a dönüşüyor | eşleme dalı olmayan bir araç değeri ver |
| 10 | Model pini uydurulmuyor | dönüştürücüye OMP pin'inden türetilmiş `model:` yaz |
| 11 | Kurulum smoke testi | installer'ı idempotent olmaktan çıkar |
| 12 | bash ve Node dönüştürücüler aynı | `lib/convert.mjs`'te bir eşlemeyi değiştir, bash karşılığını değiştirme |
| 13 | `npx skills add` uyumluluğu | `skills/` dizinini yeniden adlandır |
| 14 | npx girişi çalıştırılabilir | shebang'ı sil |

Bütün kontroller mutasyon testiyle doğrulandı: her biri kırıldığında `FAIL`
veriyor. Kontrol 12 gerçekten işe yarıyor — ilk çalıştırmada Node tarafının
`tools: ` (satır sonu boşluğu) bastığını, bash'ın `tools:` bastığını buldu.
Türkçe kontrolü de `Compile`/`argument` gibi İngilizce kelimelerde yanlış
pozitif üretmiyor.

`verify.sh` (bash) ile `npx agentic-orchestra verify` (Node) aynı değişmezleri
kontrol eder; bash tarafı 14 kontrolün tamamını, Node tarafı shell gerektirmeyen
10'unu çalıştırır.

### Kurulumdan sonra

```bash
# OMP
omp --skills='graft,review-changes' -p "list your available skills"
omp -p "list your available task agents"

# OpenCode
opencode run 'list your available agents and skills'

# Model ID'leri geçerli mi?
omp models | grep -E 'gpt-6-luna|gpt-6-sol|space-bunny-alpha|gemini-3.8-flash|opus-4-6|sonnet-4-6'
```

## Kaldırma

```bash
npx agentic-orchestra uninstall omp --dry-run    # önce ne silinecek gör
npx agentic-orchestra uninstall omp              # sil

./uninstall.sh --omp --dry-run                   # aynı iş, klon üzerinden
```

Kurulduktan sonra düzenlediğin dosyalar **silinmez**, raporlanır. `--force`
ile silinir.

`npx skills add` ile kurduysan, o CLI'ın kendi yolu var: `skills remove` ya da
kurulum dizininden sembolik bağı kaldırmak.

## Model yapılandırması

Ajanların `model:` satırları tek başına yeterli değildir. `~/.omp/agent/config.yml`
içindeki `task.agentModelOverrides` da rol bazlı pin uygular ve **ikisi
çelişebilir**. Kurulum sırasında ölçülen fark:

| Rol | `config.yml` | ajan frontmatter |
|---|---|---|
| `luna-*` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `space-bunny-*` | tanımlı değil | `stealth/space-bunny-alpha` |

Hangisinin kazandığını tahmin etmeyin. `docs/architecture.md` bu konunun tam
anlatımını, `docs/troubleshooting.md` teşhis komutlarını içerir.

OpenCode ve Claude Code tarafında model, ajan dosyasında değil runtime
config'inde belirlenir; dönüştürücüler bu yüzden pin yazmaz.

## Bilinen sınır: 7 skill boşluğu

Ajanlar 15 skill'e yönlendirme yapıyor; 9'u burada. Kalan 7'si
`docs/unresolved-skills.txt` içinde **beyan edilmiş** — `verify.sh` bu listeyi
gerçek referans kümesiyle karşılaştırır, iki yönlü de sapmada da kırmızıya
döner. Boşlukların çoğu üçüncü taraf bir repoda ya da harici bir MCP sunucusuna
bağlı; kalan tek gerçek eksik `eresus-guard`.

## Uyumluluk notu

**Skill standardı.** Skill'ler `skills/<ad>/SKILL.md` konvansiyonunu
kullanıyor; bu yüzden `npx skills add` tarafından bu depoda doğrudan keşfediliyor
(doğrulandı: yerel yol ve GitHub yolu). Ek yapılandırma gerekmiyor.

**Ajan dosyaları.** OMP ↔ OpenCode ↔ Claude Code dönüşümü **zıtlık değil, biçim
farkıdır**: üçü de aynı görevi yapar, sadece frontmatter şeması farklıdır. Bu
yüzden dönüştürücüler var; elle kopyalamak yerine onları kullan.

**İki uygulama, tek sözleşme.** Bash betikleri ve Node CLI aynı işi yapan iki
implementasyondur: bash klonlayanlar için bağımlılıksız, Node `npx` için
platformlar arası. Bu tekrar olmasaydı sorun olurdu, o yüzden `verify.sh`
kontrol 12 ikisini ajan ajan, runtime runtime **byte-byte karşılaştırır**.

## Lisans

Boost Software License 1.0 — bkz. [LICENSE](LICENSE).
