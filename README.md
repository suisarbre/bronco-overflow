# CPP CS Q&A

Cal Poly Pomona CS 튜터링용 익명 Q&A 사이트. QR 코드를 찍고 들어와서 로그인 없이 질문하고 답할 수 있어요.

- 메인: 질문 입력칸 → 그 아래 **Hot / Newest / Unanswered** 피드, 태그 필터, 검색
- 질문: 제목 + 상세(선택) + 태그(수업 / 코딩 / 커리어 / 캠퍼스 / 잡담) + 사진 1장 + 닉네임(선택)
- 본문의 링크는 자동으로 클릭 가능, ```` ``` ```` 로 감싼 코드는 코드블록, `` `x` `` 는 인라인 코드
- 추천(upvote), 질문자가 답변을 "solution"으로 채택
- 자기 글은 같은 브라우저에서 삭제 가능, 튜터는 `/admin` 에서 로그인하면 모든 글 삭제 가능
- 도배 방지(브라우저당 10분에 6개, IP당 40개), 봇용 허니팟 필드
- 사진은 브라우저에서 최대 1600px WebP로 줄여서 업로드 (보통 수백 KB 이하)
- `/qr`: 사이트 주소가 들어간 인쇄용 QR 포스터

## 스택 (전부 무료 티어)

| 역할 | 서비스 |
| --- | --- |
| 코드 | GitHub |
| 호스팅 | Vercel Hobby (Next.js 16) |
| DB | Neon Postgres (Vercel Marketplace에서 연결) |
| 사진 | Vercel Blob |

테이블은 첫 요청 때 자동으로 생성돼서 따로 마이그레이션할 필요가 없어요 ([src/lib/db.ts](src/lib/db.ts)).

## 배포하기

1. **GitHub에 올리기**: GitHub에 새 저장소(private도 됨)를 만들고 push.
   ```bash
   git remote add origin https://github.com/<you>/cpp-cs-qa.git
   git push -u origin main
   ```
2. **Vercel 프로젝트 만들기**: [vercel.com/new](https://vercel.com/new) → GitHub 저장소 Import → Deploy.
   첫 배포는 DB가 없어서 에러 페이지가 떠도 정상이에요.
3. **DB 연결**: 프로젝트 → **Storage** → **Create Database** → **Neon** (Free) → 프로젝트에 연결.
   `DATABASE_URL` 이 자동으로 추가돼요.
4. **사진 저장소 연결**: 같은 **Storage** 탭에서 **Blob** 생성 → 프로젝트에 연결.
   `BLOB_READ_WRITE_TOKEN` 이 자동으로 추가돼요.
5. **관리자 비밀번호**: 프로젝트 → **Settings → Environment Variables** 에 `ADMIN_PASSWORD` 추가 (길게).
6. **Redeploy**: Deployments → 최신 배포 → Redeploy. 이후에는 `main` 에 push할 때마다 자동 배포돼요.
7. `https://<프로젝트>.vercel.app/qr` 을 열어서 포스터를 인쇄하면 끝.

> 환경변수 이름이 다르게 들어갔다면 (예: `POSTGRES_URL` 만 있는 경우) `DATABASE_URL` 에 같은 값을 넣어주세요.
> Neon은 **pooled** 연결 문자열(호스트에 `-pooler` 포함)을 쓰는 게 좋아요.

## 로컬에서 실행

```bash
npm install
npx vercel link
npx vercel env pull .env.local
npm run dev
```

`BLOB_READ_WRITE_TOKEN` 이 없으면 개발 모드에서는 사진이 `public/uploads/` 에 저장돼요.

## 자주 바꿀 곳

- 수업 목록 / 태그: [src/lib/tags.ts](src/lib/tags.ts) (한번 쓰인 `id` 는 바꾸지 마세요)
- 도배 제한, 글자 수 제한: [src/app/actions.ts](src/app/actions.ts)
- 색상: [src/app/globals.css](src/app/globals.css)

## 무료 티어 참고

- Vercel Hobby는 비상업적 개인 프로젝트용이에요. 이 용도면 괜찮아요.
- Neon 무료 DB는 쓰는 사람이 없으면 잠들었다가, 다음 요청 때 1초 안팎으로 깨어나요 (데이터는 그대로).
- 각 서비스 사용량은 Vercel 대시보드의 **Usage** 탭에서 확인할 수 있어요.
