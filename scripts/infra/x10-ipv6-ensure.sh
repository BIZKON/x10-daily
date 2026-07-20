#!/bin/sh
# x10-daily: гарантировать IPv6-egress на eth0. api.telegram.org из РФ доступен
# ТОЛЬКО по IPv6; контейнеры постят через NAT66 поверх eth0. netplan на этом хосте
# держит eth0 как accept-ra:false / dhcp6:false, поэтому IPv6 живёт на kernel
# accept_ra=2 + DHCPv6-адресе. Рестарт systemd-networkd (напр. cloud-init в 06:10)
# сбрасывает accept_ra->0 и смывает адрес+маршрут -> постинг падает ETIMEDOUT.
# Хук восстанавливает идемпотентно; гоняется systemd-таймером каждые 2 мин.
IF=eth0
# accept_ra=2 обязателен: при forwarding=1 иначе сносится RA-маршрут eth0. Рестарт
# systemd-networkd сбрасывает его в 0 (маршрут какое-то время держится, но при
# следующей переоценке был бы потерян). Держим=2 на КАЖДОМ тике — идемпотентно,
# дёшево, устраняет тихий дрейф до того, как он обрушит IPv6.
sysctl -w net.ipv6.conf.$IF.accept_ra=2 >/dev/null 2>&1 || true
need=0
ip -6 route show default 2>/dev/null | grep -q . || need=1
# Нужен global-адрес, НЕ помеченный deprecated. По истечении preferred_lft DHCPv6
# адрес остаётся в системе как `deprecated` (старая presence-проверка `grep inet6`
# его пропускала — need=0), НО исходящие IPv6 (api.telegram.org) перестают идти →
# постинг ETIMEDOUT. dhcpcd -1 одноразовый (не демон, лиз не авто-ренью-ится),
# поэтому ловим deprecated и пере-лизим. Пустой вывод (адреса нет вовсе) → тоже need=1.
ip -6 addr show dev "$IF" scope global 2>/dev/null | grep inet6 | grep -qv deprecated || need=1
if [ "$need" = 1 ]; then
  logger -t x10-ipv6 "IPv6 degraded (no route/global-addr) — recovering"
  sysctl -w net.ipv6.conf.$IF.accept_ra=2 >/dev/null 2>&1 || true
  command -v rdisc6 >/dev/null 2>&1 && rdisc6 -1 -q -w 3000 "$IF" >/dev/null 2>&1 || true
  dhcpcd -6 -1 -w 15 "$IF" >/dev/null 2>&1 || true
  logger -t x10-ipv6 "recovery done: routes=$(ip -6 route show default 2>/dev/null | wc -l) gaddr=$(ip -6 addr show dev $IF scope global 2>/dev/null | grep -c inet6)"
fi
