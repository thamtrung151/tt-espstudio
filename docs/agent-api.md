# Agent API v1

HTTP loopback `127.0.0.1:3217`. Chỉ bind IPv4 loopback. Host phải khớp IP/cổng, Origin phải khớp allowlist cấu hình cục bộ. Origin null hoặc thiếu bị từ chối. Không wildcard CORS, không universal secret trong JS.

| Endpoint | Quyền | Kết quả |
| --- | --- | --- |
| GET /api/health | Origin hợp lệ | apiVersion, version, setup, busy; không token/đường dẫn |
| POST /api/pair/request `{}` | Origin hợp lệ | requestId, expiresAt; mã chỉ in trên Agent |
| POST /api/pair/confirm `{requestId,code}` | Mã hợp lệ | token, expiresAt, apiVersion |
| GET /api/session | Token + Origin | Phiên được xác thực và trạng thái thiết lập |
| POST /api/unpair `{}` | Token + Origin | Thu hồi token |
| POST /api/build `{config,code}` | Token + Origin | Job async; chỉ config schema đã định nghĩa và main.cpp |
| GET /api/jobs/:id | Phiên tạo job | Log/status/exitCode/target; không directory |
| POST /api/cancel `{jobId}` | Phiên tạo job | Hủy build đang chạy, không hủy upload |
| GET /api/ports | Token + Origin | Danh sách cổng thật từ PlatformIO |
| POST /api/upload `{buildId,port}` | Phiên tạo build | Nạp build thành công cùng phiên; kiểm tra port thực |

Header xác thực: `X-Studio-Token`. Request JSON, tối đa 1 MB; source tối đa 200k ký tự. Token ngẫu nhiên 256 bit, gắn origin, hết hạn sau 8 giờ, nằm trong sessionStorage tab. Mã 8 chữ số hết hạn sau 5 phút, tối đa 5 lần đoán. Request lặp dùng lại yêu cầu chưa hết hạn; restart Agent thu hồi toàn bộ token.

Một job build/upload hoạt động tại một thời điểm; job build có timeout 5 phút và hủy cả cây tiến trình trên Windows. Trạng thái success của build yêu cầu exit 0 và firmware.bin tồn tại. Log tối đa 160k ký tự; frontend polling mỗi 800ms. Chưa có SSE/WebSocket, tải artifact hoặc queue nhiều tác vụ; trả busy nếu đang chạy.

Đường dẫn và platformio.ini do server tạo; không nhận shell command, extra_scripts, path, package URL hoặc file tùy ý từ website. Platform espressif32 6.12.0 và target hiện hữu giữ nguyên. C++ biên dịch bằng toolchain cục bộ của người dùng: đây không phải sandbox cho source thù địch. Chỉ ghép nối website tin cậy; không tự nhận thư viện/build script bên ngoài.

OPTIONS chỉ cho GET/POST và Content-Type/X-Studio-Token, echo đúng origin. Có phản hồi preflight Private Network Access cho trình duyệt cần; quyền Local Network Access mới vẫn do browser quyết định. Unit/HTTP test không thay thế kiểm tra browser HTTPS thực tế.
