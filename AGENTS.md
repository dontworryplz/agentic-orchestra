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

`comm` çıktısı **bugün 14 skill listeler** ve bu liste
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
