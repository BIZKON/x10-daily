/**
 * Next.js middleware — auth guard для admin (HIGH-2).
 *
 * - Без X10_API_BASE_URL (demo mode) — пропускаем всё, нет смысла редиректить
 *   когда backend не подключён и mocks обслуживают UI.
 * - В реальном режиме: на любой странице кроме /login проверяем наличие
 *   cookie x10_session. Без неё → redirect /login?next=<path>.
 * - На /login пропускаем всегда (там нет смысла авторизации).
 *
 * Cookie сам проверяется здесь только на наличие — содержимое верифицируется
 * apps/api при следующем запросе (Bearer → verifySession). Это нормально:
 * middleware быстро отбрасывает анонимов, не делая JWT-парс на каждый клик.
 *
 * matcher исключает _next/static, _next/image и favicon — иначе перфоманс.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/session";

const PUBLIC_PATHS = new Set(["/login"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Demo mode bypass — без X10_API_BASE_URL admin рендерит mocks.
  // NODE_ENV check защищает от bypass в prod (если ENV неправильно собран).
  const isDemoMode =
    !process.env.X10_API_BASE_URL?.trim() && process.env.NODE_ENV !== "production";
  if (isDemoMode) return NextResponse.next();

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
