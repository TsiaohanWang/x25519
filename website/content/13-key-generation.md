# 第 13 章：密钥生成

> 对应论文：§4.7 钳位处理、§4.8 完成标量乘法

## 13.1 本章要回答的问题

有了第 12 章的标量乘法，生成密钥对就只剩两件事：随机数和**钳位**。本章回答：

1. 私钥为什么是"钳位后的随机字节"？钳位的三个比特各有什么理由？
2. 随机数从哪来？为什么 `rand()` 绝对不行？
3. RFC 7748 的私钥/公钥测试向量是什么？（以及旧版教程为什么错了）

## 13.2 密钥生成流程

```c
void generate_keypair(u8 *pk, u8 *sk)
{
    generate_random_bytes(sk, 32);   /* 1. 32 字节随机数 */
    clamp(sk);                        /* 2. 钳位 */
    x25519(pk, sk, base_point);       /* 3. pk = x25519(sk, 9) */
}
```

1. **随机数**：32 字节密码学安全随机数（见 13.4 节）。
2. **钳位**：修改其中 5 个比特，见 13.3 节。
3. **公钥**：用第 12 章的标量乘法计算 $sk \cdot g$（基点 $x = 9$）的 $x$ 坐标，
   打包成 32 字节。

## 13.3 钳位处理：三个比特的三个理由

```c
static void clamp(u8 *k)
{
    k[0] &= 248;    /* 清除最低 3 位：k 成为 8 的倍数 */
    k[31] &= 127;   /* 清除最高位（bit 255）：k < 2^255 */
    k[31] |= 64;    /* 设置次高位（bit 254）：k >= 2^254 */
}
```

**（1）`k[0] &= 248`：最低 3 位清零，即 $k$ 是 8 的倍数。** 这是对第 4.6 节
小子群攻击的防御：$k = 8k'$ 时，若攻击者发送阶整除 8 的点 $s$，则 $s^k = (s^8)^{k'} = e$
恒为单位元，攻击者得不到私钥信息。对合法的阶 $q$ 基点，$8k'$ 与 $k'$ 产生的分布
相同（$8$ 与 $q$ 互素），所以无害。

**（2）`k[31] &= 127`：最高位清零，即 $k < 2^{255}$。** 配合 (1)，钳位后
$k = 8k'$ 且 $k' < 2^{252}$。上界 $2^{252} - 1$ 略低于 $q$（$q = 2^{252} + \ldots$），
论文指出从 $[0, 2^{252}-1]$ 选 $k'$ 与从 $[0, q-1]$ 选几乎等价（落在
$[2^{252}, q-1]$ 的概率约 $10^{-38}$）。

**（3）`k[31] |= 64`：次高位设为 1，即 $k \ge 2^{254}$。** 这与余因子无关，是
**常数时间的预防措施**：如果 $k$ 的最高位是 0，一个"偷懒"的实现可能跳过阶梯的
第一次迭代（因为 $k$ 的 bit 254 为 0 时这轮没有效果），产生可观察的时间差，
泄露私钥的最高位。强制 bit 254 = 1 保证阶梯**总是执行完整的 255 次迭代**。
（我们的实现本来就是常数时间，但这个比特让所有实现都无法偷懒。）

另外，钳位还有一个**正确性**理由：如果 $k = 0$ 或 $k$ 是 $q$ 的倍数，则
$P^k = \infty$。`scalarmult` 只能返回 $x$ 坐标，无法区分"$x$ 坐标为 0 的点"和
"$\infty$"（两者都输出 0）。强制 $0 < k < q$（结合 (1)(2)(3) 得 $k \in [8 \cdot 2^{251}, 2^{255}-1]$，
且 $k < 8q$ 基本成立）避免了正常协议中产生 $\infty$ 的情况。

对照 **RFC 7748 的 `decodeScalar25519`**——RFC 对"32 字节随机标量"做的处理与
`clamp` 完全一致：

```python
def decodeScalar25519(k):
    k_list = [ord(b) for b in k]
    k_list[0] &= 248
    k_list[31] &= 127
    k_list[31] |= 64
    return decodeLittleEndian(k_list, 255)
```

## 13.4 随机数：为什么 `rand()` 不行

私钥必须是**不可预测**的。`rand()` 基于线性同余生成器，是可预测的；更糟的是很多
实现以 `time(NULL)` 为种子，攻击者知道大致时间就能重建整个序列。密码学要求使用
**密码学安全伪随机数生成器（CSPRNG）**：

- Linux/Unix：`/dev/urandom`（由内核熵池驱动）；
- Windows：`BCryptGenRandom`；
- 库：libsodium 的 `randombytes_buf`、OpenSSL 的 `RAND_bytes`。

本仓库的 `generate_random_bytes` 打开 `/dev/urandom` 读取：

```c
static void generate_random_bytes(u8 *buf, int len)
{
    int fd = open("/dev/urandom", O_RDONLY);
    if (fd < 0) { perror("open /dev/urandom"); exit(1); }
    ssize_t nread = read(fd, buf, len);
    if (nread != len) { perror("read /dev/urandom"); close(fd); exit(1); }
    close(fd);
}
```

常见错误：种子熵不足、用 `rand()`、在不同场景复用同一随机数、随机数泄露到日志。

## 13.5 RFC 7748 §6.1 测试向量（正确版本）

> **勘误**：旧版教程引用 `a0a1…bf → e6db…` 并称其为 "RFC 7748 测试向量"，这是
> **错误的**——RFC 7748 中不存在这组数据（`e6db…` 是 §5.2 向量 1 的 u 坐标输入，
> `c3da…` 是它的输出，与 Alice/Bob 密钥对无关）。正确的 Diffie-Hellman 测试向量
> 在 RFC 7748 §6.1：

```
Alice's private key, a:
  77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a
Alice's public key, X25519(a, 9):
  8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a
Bob's private key, b:
  5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb
Bob's public key, X25519(b, 9):
  de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f
Their shared secret, K:
  4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742
```

第 14 章会用它做端到端验证；`test.c` 与 `rfc7748_check.c` 也都使用这组真实数据。

## 13.6 练习

1. 对 RFC 7748 §6.1 的 Alice 私钥 `77076d0a…2c2a` 手工执行 `clamp`，确认
   最低 3 位、bit 255、bit 254 的修改，并用 13.5 节的公钥验证结果。
2. 解释钳位最低 3 位如何防御小子群攻击（结合第 4.6 节）。
3. 解释 bit 254 置 1 为什么是"常数时间的预防措施"——即使实现本身是常数时间。
4. 为什么"私钥 $k = 0$"会破坏 `scalarmult` 的返回值语义？钳位如何排除它？
5. 用 `x25519(sk, base)` 验证 RFC 7748 §6.1 的 Alice 公钥：在仓库根目录执行
   `gcc -O2 -Wall -Wextra -o rfc7748_check rfc7748_check.c x25519-tutorial/x25519.c
   && ./rfc7748_check`，应全部 PASS。

## 13.7 小结

- 私钥 = 32 字节 CSPRNG 随机数 + 钳位（清最低 3 位、清 bit 255、置 bit 254）。
- 钳位同时服务于安全（防小子群、防 $\infty$ 输出）与常数时间（强制满迭代）。
- RFC 7748 §6.1 提供了正确的密钥生成测试向量。

下一章把密钥对组装成完整的 Diffie-Hellman 密钥交换。
