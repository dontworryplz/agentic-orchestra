# Skill referansı

## Bu depoda gelenler (9)

| Skill | Ne yapar | Tetikleyici |
|---|---|---|
| [`sol-luna-orchestrator`](../skills/sol-luna-orchestrator/SKILL.md) | Conductor/specialist topolojisi, görev→rol yönlendirme tablosu, delegasyon ve yetki sınırları. | Kök oturumda iş dağıtımı yapılacağı zaman. |
| [`context-fetch`](../skills/context-fetch/SKILL.md) | En ucuz yeterli yüzeyden başlayarak bağlam kontrolü; ilk `read` öncesi "hiçbir şey okuma" kapısı. | Bir dosyayı açmadan önce, sembol bulmadan önce. |
| [`debug-issue`](../skills/debug-issue/SKILL.md) | repro → karakterize → localize → açıkla → kökten düzelt → aynı senaryoyu kanıtla → sınıfı koru. | Bug, crash, yanlış sonuç, kararsız davranış. |
| [`empirical-validation`](../skills/empirical-validation/SKILL.md) | Kanıt merdiveni, yanlışlayma testi, komut hijyeni, "kanıt olmayan 11 şey" tablosu. | Bir düzeltmeyi çalışıyor ilan etmeden önce. |
| [`review-changes`](../skills/review-changes/SKILL.md) | Diff tabanı kurma, altı kademeli öncelik sırası, P0–P3, bildirmeden önce kendini çürütme. | Merge ya da commit öncesi bağımsız kapı. |
| [`executor`](../skills/executor/SKILL.md) | Sahiplik sözleşmesi, öncelik kuralları, "dur ve bildir" koşulları, genişletmeme disiplini. | Onaylı, daraltılmış bir plan görevi yürütürken. |
| [`verifier`](../skills/verifier/SKILL.md) | Spec maddesi → yanlışlayan gözlem; üç karar değeri, kısmi puan yok; dokuz yüksek değerli yüzey. | Spec/şartname/kabul kriterini koda karşı doğrularken. |
| [`refactor-safely`](../skills/refactor-safely/SKILL.md) | Düzenlemeden önce patlama yarıçapı, risk sınıflandırma, genişlet→migre et→daralt, "referans yok" için iki arama yöntemi. | Davranışı koruyan yapısal değişiklikte. |
| [`graft`](../skills/graft/SKILL.md) | `graft/` kod grafiğinden bağlam, çağrı izleri, blast radius, dosya API'si. Preflight indeksin varlığını doğrular. | Yalnızca graft-indexed repo'da, grep/okumadan önce. |

Ajanlar 15 `skill://` referansı yapıyor; 9'u burada, 6'sı
[`unresolved-skills.txt`](unresolved-skills.txt) içinde beyan edilmiş.
`eresus-guard` ayrıca orchestrator skill'inden düz adla (URI'siz) geçiyor.

## Nasıl kurulur

Bu 9 skill `npx skills add dontworryplz/agentic-orchestra-` ile kurulabilir;
`skills/<ad>/SKILL.md` konvansiyonuna uyuyorlar ve CLI onları doğrudan keşfeder.
Ajan tanımlarının da gelmesi için ya da OMP'ye kurmak için
`npx agentic-orchestra` kullanılır. Ayrıntı: [README](../README.md#kurulum).

## Beyan edilmiş boşluklar (7)

`verify.sh` kontrol 3'ü bu listeyi gerçek referans kümesiyle karşılaştırır ve
**her iki yönde** sapmada kırmızıya döner: listede olmayan bir referans, ya da
artık çözülen bir kayıt.

| Skill | Neden yok | Kapatmanın yolu |
|---|---|---|
| `eresus-guard` | hiçbir yerde yok | **yazar.** Güvenlik kapısı prosedürü; en yüksek değerli boşluk. |
| `caveman` | `~/.agents/skills` ve `~/.config/opencode/skills` altında var | üçüncü taraf; buraya vendor'lamak yerine sembolik bağ |
| `codebase-memory` | `codebase-memory-mcp` sunucusuna bağlı | MCP destekli; taşınabilir bir `SKILL.md` değil |
| `context7-mcp` | context7 MCP sunucusuna bağlı | MCP destekli |
| `gitnexus-exploring` | gitnexus CLI + indeks gerektirir | üçüncü taraf |
| `gsd-code-review` | GSD skill kümesinin parçası | üçüncü taraf |
| `no-ai-slop` | `~/.omp/skills` altında kurulu, başka yerde yazılmış | üçüncü taraf |

Boşluğu beyan etmek, skill'i uydurmaktan iyidir: ajan geçerli bir ad görüp
takip edeceği boş bir prosedür bulursa, kendi kafasından bir tane üretir.

## Sembolik bağ kurulumu

Orijinali başka bir yerde duran bir skill'i güncellemeleriyle birlikte takip
etmek için:

```bash
mkdir -p ~/.omp/skills
ln -s ~/.agents/skills/caveman ~/.omp/skills/caveman
```

Sembolik bağ, `install.sh`'in kopyalama davranışıyla çelişir: kurulum betiği
dizini silip kopyalar. Bağ kurarsan o skill'i `--agents-only` ile kur ya da
`install.sh`'i skill'i hiç işlememesi için çalıştırma.

## Opsiyonel bağımlılıklar

Bu skill'ler **harici bir araca** bağlıdır; dosyayı kopyalamak yetmez.

| Skill | Gereken dış arayüz | Durum |
|---|---|---|
| `graft` | `graft/` indeksi ya da graft MCP sunucusu | binary PATH'te değil; indeks yalnızca bazı repolarda |
| `codebase-memory` | `codebase-memory-mcp` MCP sunucusu | bu makinede bağlı |
| `gitnexus-exploring` | `gitnexus` CLI veya MCP | ayrı indeksleme adımı gerekir |
| `context7-mcp` | context7 MCP sunucusu | MCP config'ine eklenmeli |

Ajan gövdesi bu ayrımı bilmez; `graft` skill'i kendi preflight'ını içerir,
diğerleri için `docs/troubleshooting.md` bak.
