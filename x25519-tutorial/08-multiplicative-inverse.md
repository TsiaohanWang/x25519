# 第 8 章：乘法逆元

> 对应论文：§3.3 计算乘法逆元

## 8.1 本章要回答的问题

域算术的最后一个运算是**除法**。第 3 章说过：$\frac{b}{a} = b \cdot a^{-1}$，而$a^{-1} \equiv a^{p-2} \pmod{p}$（费马小定理）。本章回答：

1. $a^{p-2}$ 怎么高效计算？“平方-乘法”是什么？
2. 论文代码里 `for (i = 253; i >= 0; --i)` 为什么从 253 开始？
3. `if (i != 2 && i != 4)` 这两个特殊的比特是怎么回事？

## 8.2 平方-乘法

要算 $a^{e}$（$e = p - 2$ 是 255 位整数），朴素做法要 $e$ 次乘法——不可行。平方-乘法利用指数二进制展开的递归关系：

$$a^{2i} = a^i \cdot a^i, \qquad a^{2i+1} = a \cdot a^i \cdot a^i$$

即：先递归算出 $a^i$，平方得到 $a^{2i}$；若指数是奇数再乘一个 $a$ 得到 $a^{2i+1}$。从指数 $e$ 的**最高位**往下扫描：每处理一位，先把当前结果平方；如果该位是 1，再乘一次底数。这样只需要 $O(\log e)$ 次乘法——对 255 位指数大约 255 次平方和约一半的乘法。

## 8.3 $p - 2$ 的二进制结构

$p = 2^{255} - 19$，所以 $p - 2 = 2^{255} - 21$。写成二进制：

$$p - 2 = 2^{255} - 21 = 2^{255} - 16 - 4 - 1$$

也就是说，在 $2^{255}$ 上减去 $2^4 + 2^2 + 2^0$。低位部分（bit 0..7）：

$$2^{255} - 21 \equiv 256 - 21 = 235 = 11101011_2 \pmod{256}$$

所以低 8 位是 `11101011`：**bit 0、1、3、5、6、7 为 1，bit 2 和 bit 4 为 0**；从 bit 8 到 bit 254 全部为 1。总结：

| 比特位 | 值 |
|--------|-----|
| bit 254（最高位）… bit 8 | 全 1 |
| bit 7 … bit 0 | `11101011`（bit 2、bit 4 为 0，其余为 1） |

十六进制是 `0x7f` 后跟 30 个 `ff`，再 `eb`（共 64 个十六进制字符，即 32 字节的小端编码 `7f ff ff … ff eb`；对照 $p = 2^{255}-19$ 的编码 `…ed`，减 2 后末字节变 `eb`）。

## 8.4 finverse 实现

```c
static void finverse(field_elem out, const field_elem in)
{
    field_elem c;
    int i;

    for (i = 0; i < 16; ++i) c[i] = in[i];   /* c = in */

    for (i = 253; i >= 0; --i) {
        fmul(c, c, c);                        /* 平方 */
        if (i != 2 && i != 4) fmul(c, c, in); /* 若该位为 1 则乘 in */
    }

    for (i = 0; i < 16; ++i) out[i] = c[i];
}
```

逐点解释：

1. **`c` 初始化为 `in` 而不是 1**。标准平方-乘法从 `c = 1` 开始、从 bit 254 扫到
   bit 0：第一轮（i=254）`c = 1² = 1`，然后因为 bit 254 是 1，`c = 1 · in = in`。论文直接让 `c = in`，等价于**已经完成**了 bit 254 的处理，于是循环从
   **bit 253** 开始——少做一次迭代。这就是“从 253 开始”的来历，不是笔误。
2. **`if (i != 2 && i != 4)`**。$p - 2$ 中只有 bit 2 和 bit 4 是 0，其余位是 1；平方-乘法只在该位为 1 时乘 `in`，所以这里**跳过**这两个特定位。这个条件只依赖公开的循环变量 $i$，不是秘密——因此它是常数时间的安全分支。
3. 循环结束后 $c = in^{p-2} \bmod p$ 等于 `in` 的乘法逆元。整个序列是固定的 254 次平方 + 252 次乘法，执行时间与 `in` 的值无关。

**耗时**：254 次平方 + 252 次乘法 ≈ 506 次 `fmul`。对比第 12 章 Montgomery 阶梯（255 次迭代 × 10 次乘法 ≈ 2550 次），逆元约占五分之一——这就是为什么
`finverse` 在整个 X25519 中只调用**一次**（第 12 章结尾），而不是在阶梯内部调用。

## 8.5 常数时间性讨论

`finverse` 是常数时间的吗？逐条检查：

- 循环次数固定（254 次）；
- `if (i != 2 && i != 4)` 的分支只取决于 $i$（公开常量），不取决于 `in`；
- `fmul` 本身无数据依赖分支（第 7 章）。

所以是常数时间。对比：扩展欧几里得算法（第 3 章提过）的迭代次数随输入变化，不是常数时间，因此被排除。

## 8.6 C 代码：验证 $2^{-1}$

```c
#include <stdio.h>

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

static void unpack25519(field_elem out, const u8 *in) {
    int i;
    for (i = 0; i < 16; ++i) out[i] = in[2*i] + ((i64) in[2*i + 1] << 8);
    out[15] &= 0x7fff;
}
static void carry25519(field_elem elem) {
    int i; i64 carry;
    for (i = 0; i < 16; ++i) {
        carry = elem[i] >> 16;
        elem[i] -= carry << 16;
        if (i < 15) elem[i + 1] += carry;
        else elem[0] += 38 * carry;
    }
}
static void fmul(field_elem out, const field_elem a, const field_elem b) {
    i64 i, j, product[31];
    for (i = 0; i < 31; ++i) product[i] = 0;
    for (i = 0; i < 16; ++i)
        for (j = 0; j < 16; ++j) product[i+j] += a[i] * b[j];
    for (i = 0; i < 15; ++i) product[i] += 38 * product[i + 16];
    for (i = 0; i < 16; ++i) out[i] = product[i];
    carry25519(out); carry25519(out);
}
static void finverse(field_elem out, const field_elem in) {
    field_elem c;
    int i;
    for (i = 0; i < 16; ++i) c[i] = in[i];
    for (i = 253; i >= 0; --i) {
        fmul(c, c, c);
        if (i != 2 && i != 4) fmul(c, c, in);
    }
    for (i = 0; i < 16; ++i) out[i] = c[i];
}
static int fe_eq(const field_elem a, const field_elem b) {
    for (int i = 0; i < 16; ++i)
        if ((a[i] & 0xffff) != (b[i] & 0xffff)) return 0;
    return 1;
}
static int fe_is_one(const field_elem a) {
    field_elem one = {0}; one[0] = 1;
    return fe_eq(a, one);
}

int main(void) {
    u8 two_b[32] = {2};
    field_elem two, inv, prod;
    unpack25519(two, two_b);
    finverse(inv, two);
    fmul(prod, two, inv);
    printf("2 * 2^{-1} == 1 ? %s\n", fe_is_one(prod) ? "是" : "否");
    return 0;
}
```

> 说明：`fe_eq` 只比较低 16 位，因为我们没有做完整的模 $p$ 归约；`2 * 2^{-1}`
> 的结果在模 $p$ 意义下是 1，未完全归约的表示中低位 limb 已经是 1。（严格验证请参考 `test.c` 里基于 RFC 向量的端到端测试。）

## 8.7 练习

1. 写出 $p - 2 = 2^{255} - 21$ 的完整十六进制，确认只有 bit 2、bit 4 为 0。
2. 证明：把 `c` 初始化为 `in`、从 bit 253 开始循环，与标准做法（`c=1`、从 bit 254
   开始）结果相同。
3. 分析 `finverse` 的乘法次数（254 次平方 + 252 次乘法），并与朴素 $p-2$ 次乘法对比。
4. 如果 `if (i != 2 && i != 4)` 改成 `if (in[0] & 1)` 会怎样？为什么那会破坏常数时间？
5. 用第 7 章练习 2 的 Python 参考实现，随机测试 `finverse`：对随机 `a`，
   `a * a^{-1} == 1` 应恒成立。

## 8.8 小结

- 逆元 $a^{-1} \equiv a^{p-2} \pmod{p}$，用平方-乘法在 $O(\log p)$ 次乘法内算出。
- $p - 2$ 的二进制只有 bit 2、4 为 0，`finverse` 硬编码了这个模式；
  `c` 初始化为 `in` 省去最高位迭代。
- 整个序列固定，是常数时间的；`finverse` 在整个 X25519 中只调用一次。

下一章完成域算术的最后一块：把 `field_elem` 打包回字节数组（`pack25519`），顺便实现常数时间条件交换 `swap25519`。
