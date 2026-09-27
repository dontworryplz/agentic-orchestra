# AGENTS.md

Bu depoyu değiştirmeden önce oku. Repo, OMP ajan/skill dosyalarının **kaynak
kopyasıdır**; `~/.omp/agent/agents` ve `~/.omp/skills` dağıtım hedefleridir.

## Değişmezler

1. **Model pinlerini kanıtsız değiştirme.** `model:` satırları ile
   `config.yml` `task.agentModelOverrides` çelişebilir. Hangisinin geçerli
   olduğunu `omp models` ve gerçek bir `task` sonucuyla doğrula; ikisi
   farklıysa ikisini de belgele.
2. **Var olmayan skill'e yöndirme.** Ajan gövdesindeki her `skill://<ad>` ya
   `skills/<ad>/SKILL.md` olarak var olmalı ya da bilinçli olarak kaldırılmalı.
   `docs/skills-reference.md` bu boşluğun güncel haritasıdır — yeni bir skill
   eklerken veya bir referansı kaldırırken güncelle.
3. **Dil ayrımı.** `agents/*.md` ve `skills/*/SKILL.md` **İngilizce** kalır
   (runtime prompt'larıdır, modeller bunu okur). `README.md` ve `docs/` Türkçe.
4. **Salt-okunur roller kısa kalır.** `edit`/`write` içermeyen bir ajanın
   gövdesine yazma yeteneği ekleme.
5. **Hiçbir ajan `stage`/`commit` çağırmaz.** Bu kural ajan gövdelerinin
   sözleşmesidir; gevşetme.
6. **İki dönüştürücüyü birlikte değiştir.** `install-opencode.sh` /
   `install-claude.sh` ile `lib/convert.mjs` aynı eşlemeleri uygular. Tek
   tarafı değiştirmek `verify.sh` kontrol 12'yi kırmızıya döndürür — bu
   kasıtlı. Kırmızı görürsen ya karşı tarafı da düzelt ya da kontrolü
   gevşetme; eşlemeyi kasten ayırmak istiyorsan gerekçeyi yaz.
7. **`skills/` konvansiyonunu koru.** `npx skills add` yapılandırma okumaz,
   dizin yapısını okur. `skills/<ad>/SKILL.md` yerleşimini bozma; `verify.sh`
   kontrol 13 bunu assert eder.
8. **`bin/` giriş noktası çalıştırılabilir olmalı.** Shebang ve exec biti
   olmadan `npx` sessizce shell'e düşüyor ve "import: command not found"
   gibi anlaşılmaz bir hata veriyor. Bu bir kez oldu.

## Düzen

```
agents/     bir ajan = bir dosya, dosya adı = frontmatter `name`
skills/     bir skill = bir dizin, SKILL.md frontmatter `name` = dizin adı
docs/       bu depoya özgü gerçekler; genel ajan rehberi değil
```

Ajan dosyası yeniden adlandırılırsa `docs/architecture.md` tablosu ve
`skills/sol-luna-orchestrator/SKILL.md` yönlendirme tablosu güncellenir.

## Doğrulama

Değişiklikten sonra çalıştır:

```bash
# her şeyi tek komutta doğrula (bash tarafı, 14 kontrol)
./verify.sh

# frontmatter ayrıştırma + skills referans bütünlüğü
for f in agents/*.md skills/*/SKILL.md; do
  head -1 "$f" | grep -q '^---$' || echo "EKSİK FRONTMATTER: $f"
done
comm -23 <(grep -ohE 'skill://[a-z0-9-]+' agents/*.md skills/*/SKILL.md \
             | sed 's|skill://||' | sort -u) <(ls skills | sort)

# kurulum betiği
bash -n install.sh && ./install.sh --dry-run

# izole bir köke gerçek kurulum
PI_CODING_AGENT_DIR=/tmp/omp-verify HOME=/tmp/omp-verify-home ./install.sh
```

`comm` çıktısı **bugün 7 skill listeler** ve bu liste
`docs/skills-reference.md` "Durum" sütunuyla birebir eşleşmelidir. Burada
**tanımadığın bir ad çıkarsa** ya bir skill eksik ya da dokümantasyon
güncel değildir — ikisini de düzelt, commit'le birlikte.

Model ID'lerini doğrulamak için `omp models` gerekir; bu bir ağ çağrısı
yapabilir, kullanıcıdan izin alınmalıdır.

## Commit

- Kurulum/doğrulama çıktısı commit'e giremez.
- `docs/` ile `agents/` değişikliklerini tek commit'te birleştirme; model
  pinleri, ajan metni ve dokümantasyon ayrı commit'lerde izlenebilir olsun.
- Dosya adlarının sonundaki tire bir yazım hatası değil, depodaki gerçek addır.
