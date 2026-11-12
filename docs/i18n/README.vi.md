<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Khuôn khổ Chủ quyền Kiến trúc và Kiểm soát Entropy Cấu trúc

[English](../../README.md) · [Ngôn ngữ khác](README.md) · [Hướng dẫn bắt đầu](../GETTING_STARTED.md) · [Giao thức Agent](../../AGENTS.md)

> *“Đừng xây dựng thêm một nơi để các tác tử chạy. Hãy xây dựng thứ mà các tác tử có thể học hỏi, mang theo và tái tạo độc lập ở bất cứ đâu.”*

**Tóm tắt trong một câu:** HEAV3NS-JOY giữ cho các cơ sở mã (do con người viết hay do tác tử AI sinh ra) luôn trung thực về mặt kiến trúc bằng cách sử dụng một quy ước tối giản và một bộ kiểm tra không phụ thuộc.

---

## Ý tưởng trong 60 giây

| Khía cạnh | Chi tiết |
| :--- | :--- |
| **Là gì** | Một quy ước kèm theo công cụ kiểm tra không có phụ thuộc bên ngoài. Mỗi tệp khai báo một trong năm vùng chuẩn (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) ở tiêu đề dòng đầu. |
| **Tại sao** | Kiến trúc thường bị suy thoái âm thầm, và các tác tử AI đẩy nhanh sự suy thoái đó. Việc cấu trúc có thể kiểm tra được bằng máy móc giúp ngăn chặn sự mục ruỗng ngay từ commit. |
| **Như thế nào** | Đặt tệp vào đúng thư mục vùng, chỉ nhập phụ thuộc theo hướng cho phép và chạy `node bin/joy-check.mjs .`. Mã thoát `0` nghĩa là kiến trúc hoàn toàn lành mạnh. |
| **Chi phí** | **Không phụ thuộc bên ngoài**, không cần tài khoản, không cần mạng, mặc định chỉ đọc. |

### Phép so sánh Nhà hàng

Hãy tưởng tượng cơ sở mã như một nhà hàng:
- **Nhà bếp (`DOMAIN`)**: Nấu các công thức thuần túy và quy tắc nghiệp vụ; tuyệt đối không được gọi điện thoại cho nhà cung cấp khi đang nấu.
- **Điều phối (`CORE`)**: Điều phối các đơn gọi món và trường hợp sử dụng.
- **Nhà cung cấp (`INFRASTRUCTURE`)**: Bộ chuyển đổi hệ thống tệp, HTTP và cơ sở dữ liệu.
- **Phòng ăn (`UI`)**: Phục vụ thực khách và hiển thị giao diện; không bao giờ được tự ý bước vào kho nguyên liệu.
- **Hệ thống đường ống (`PLUMBING`)**: Các hàm tiện ích phi trạng thái và hoàn toàn độc lập.

---

## Năm vùng chuẩn hóa

| Vùng | Thư mục | Trách nhiệm | Quy tắc bất biến |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Quy tắc nghiệp vụ, thực thể, hợp đồng `I*` | **0% entropy I/O**; cấm nhập hạ tầng hoặc UI |
| `CORE` | `src/core/` | Điều phối nghiệp vụ, máy trạng thái | Cấm nhập UI; chỉ tương tác hạ tầng qua giao diện |
| `INFRASTRUCTURE` | `src/infrastructure/` | Bộ điều hợp fs, HTTP, cơ sở dữ liệu | Cấm nhập UI; hiện thực hóa hợp đồng của Domain |
| `PLUMBING` | `src/plumbing/` | Mật mã học, tiện ích phi trạng thái | Tầng lá; cấm nhập bất kỳ vùng nào khác |
| `UI` | `src/ui/` | Trình hiển thị CLI, định tuyến HTTP, giao diện | Cấm nhập trực tiếp hạ tầng |

---

## Bắt đầu nhanh (2 phút)

Không cần chạy `npm install` (chỉ cần Node.js 18+ và git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Chạy bộ kiểm thử (196 bài kiểm thử thành công)
npm test

# 2. Kiểm toán chủ quyền kiến trúc
npm run joy-check

# 3. Cài đặt cấu hình tác tử AI (Claude, Cursor, Antigravity, v.v.)
npx heav3ns-joy init
```

Xem thêm tại [Cổng tài liệu](../README.md) và [Mô hình chuẩn](../../spec/00-CANONICAL-MODEL.md).

