#!/bin/sh
# x10-daily: гарантировать IPv6-egress на eth0. api.telegram.org из РФ доступен
# ТОЛЬКО по IPv6; контейнеры постят через NAT66 поверх eth0. netplan на этом хосте
# держит eth0 как accept-ra:false / dhcp6:false, поэтому IPv6 живёт на kernel
# accept_ra=2 + DHCPv6-адресе. Рестарт systemd-networkd (напр. cloud-init в 06:10)
# сбрасывает accept_ra->0 и смывает адрес+маршрут -> постинг падает ETIMEDOUT.
# Хук восстанавливает идемпотентно; гоняется systemd-таймером каждые 2 мин.
IF=eth0
need=0
ip -6 route show default 2>/dev/null | grep -q . || need=1
ip -6 addr show dev "$IF" scope global 2>/dev/null | grep -q inet6 || need=1
if [ "$need" = 1 ]; then
  logger -t x10-ipv6 "IPv6 degraded (no route/global-addr) — recovering"
  sysctl -w net.ipv6.conf.$IF.accept_ra=2 >/dev/null 2>&1 || true
  command -v rdisc6 >/dev/null 2>&1 && rdisc6 -1 -q -w 3000 "$IF" >/dev/null 2>&1 || true
  dhcpcd -6 -1 -w 15 "$IF" >/dev/null 2>&1 || true
  logger -t x10-ipv6 "recovery done: routes=$(ip -6 route show default 2>/dev/null | wc -l) gaddr=$(ip -6 addr show dev $IF scope global 2>/dev/null | grep -c inet6)"
fi
