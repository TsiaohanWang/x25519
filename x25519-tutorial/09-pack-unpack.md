# 第 9 章：打包与解包

> 对应论文：§3.4 转换回字节数组

## 9.1 本章要回答的问题

第 5 章讲了解包（字节 → `field_elem`）。本章完成反向：把 `field_elem` 打包回字节数组，并且**顺带完成唯一一次完整的模 $p$ 归约**。要回答：

1. 为什么 `pack25519` 必须做完整的模 $p$ 归约，而其他函数可以偷懒？
2. “常数时间地选择 $t$、$t-p$、$t-2p$ 三者之一”是怎么做到的？
3. `swap25519` 为什么能“常数时间地条件交换”？

## 9.2 为什么打包时需要完整归约

域 $\mathbb{Z}_p$ 中同一个元素可能有多种 16-limb 表示（例如 $p$ 与 $0$ 相差 $p$）。第 5 章允许未归约输入是因为内部运算不在乎；但**一旦要输出成字节**（用作公钥或共享密钥），就必须保证：

> $\mathbb{Z}_p$ 中每个元素对应**唯一的字节串**。

否则，同一个公钥可能有两种编码，不同实现会互相不兼容。这就是 `pack25519` 必须把结果彻底归约到 $[0, p-1]$ 的原因。这也是全教程中唯一一次“完全归约”。

## 9.3 swap25519：常数时间条件交换

`pack25519` 需要一个工具：根据一个比特，常数时间地决定是否交换两个数组。

```c
static void swap25519(field_elem p, field_elem q, int bit)
{
    i64 t, i, c = ~(bit - 1);
    for (i = 0; i < 16; ++i) {
        t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
    }
}
```

分析（`bit` 只取 0 或 1）：

- `c = ~(bit - 1)`：`bit == 0` 时 `c = ~(-1) = 0`；`bit == 1` 时 `c = ~0 = 0xff…ff`。
- `t = c & (p[i] ^ q[i])`：`bit == 0` 时 `t = 0`；`bit == 1` 时 `t = p[i] ^ q[i]`。
- 于是 `p[i] ^= t`：`bit == 0` 无效果；`bit == 1` 时 `p[i] = p[i] ^ (p[i] ^ q[i]) = q[i]`。对称地 `q[i]` 变成 `p[i]`——两者交换。

**为什么不用 `if (bit) swap(p, q);`**？因为 `bit` 可能是秘密值（例如标量乘法的某一位，见第 12 章）。`if` 分支会导致执行时间随 `bit` 变化，泄露信息。上面的写法无论 `bit` 是多少都执行完全相同的 16 次迭代、相同的指令序列——
只是掩码不同。这就是“常数时间条件交换”。

## 9.4 pack25519：完整的模 $p$ 归约

```c
static void pack25519(u8 *out, const field_elem in)
{
    int i, j, carry;
    field_elem m, t;

    for (i = 0; i < 16; ++i) t[i] = in[i];
    carry25519(t); carry25519(t); carry25519(t);

    for (j = 0; j < 2; ++j) {
        m[0] = t[0] - 0xffed;
        for (i = 1; i < 15; ++i) {
            m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
            m[i - 1] &= 0xffff;
        }
        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
        carry = (m[15] >> 16) & 1;
        m[14] &= 0xffff;
        swap25519(t, m, 1 - carry);
    }

    for (i = 0; i < 16; ++i) {
        out[2*i]     = t[i] & 0xff;
        out[2*i + 1] = t[i] >> 8;
    }
}
```

逐步拆解：

**第一步：三次 `carry25519`**。第 5 章讲过：三次调用后所有元素**严格**落在$[0, 2^{16}-1]$。此时 $t$ 是一个 256 位数，可能落在 $[0, 2^{256}-1]$ 的任意位置（即可能比 $2p$ 还大一点）。

**第二步：常数时间地减去 $p$（最多两次）**。归约的目标是 $t \in [0, p-1]$。可能的三种情况：

1. $0 \le t < p$：什么都不用做；
2. $p \le t < 2p$：需要 $t := t - p$；
3. $2p \le t < 2^{256}$：需要 $t := t - 2p$。

**不能**用 `if (t >= p) t -= p;`——那是数据依赖分支。办法：**把 $t - p$ 算出来，若结果非负就采用，否则保留 $t$**；循环两次就能覆盖“减一次”和“减两次”两种情况。

内层循环计算 $m = t - p$（16-limb 减法，逐元素减 `p` 的对应 16 位块
`0xffed`、`0xffff`、…、`0x7fff`，并处理借位）：

```c
m[0] = t[0] - 0xffed;
for (i = 1; i < 15; ++i) {
    m[i] = t[i] - 0xffff - ((m[i-1] >> 16) & 1);  /* 减去上一位的借位 */
    m[i-1] &= 0xffff;                             /* 把已处理位压回 16 位 */
}
m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
carry = (m[15] >> 16) & 1;                        /* 最高位的借位 */
m[14] &= 0xffff;
```

`carry` 是 $t - p$ 的符号位：结果为负时是 1，非负时是 0。然后 `swap25519(t, m, 1 - carry)`：

- 若 `carry == 1`（$t < p$，减完是负数），`1 - carry = 0`，不交换，保留 $t$；
- 若 `carry == 0`（$t \ge p$，减完非负），`1 - carry = 1`，交换，$t$ 变成 $t - p$。

两次外层循环：第一次把 $t$ 降到 $[0, 2p)$（若原本 $\ge 2p$），第二次再降一次到$[0, p)$。最终 $t \in [0, p-1]$，且全程无数据依赖分支。

**第三步：拆字节**。每个 16 位元素拆成两个字节：`out[2i] = t[i] & 0xff`（低字节），
`out[2i+1] = t[i] >> 8`（高字节）。

## 9.5 与 RFC 的对应

RFC 7748 的 `encodeUCoordinate` 对 u 坐标做 `u % p` 后输出 32 字节小端；
`pack25519` 实现的正是“规范到 $[0, p-1]$ 再编码”，二者等价。这也解释了为什么
X25519 的输入输出都是**规范编码**——RFC 要求实现“MUST accept non-canonical
values”（输入宽容），但输出必须是规范的（`pack25519` 保证）。

## 9.6 C 代码：round-trip 验证

```c
#include <stdio.h>
#include <string.h>

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
static void swap25519(field_elem p, field_elem q, int bit) {
    i64 t, i, c = ~(bit - 1);
    for (i = 0; i < 16; ++i) {
        t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
    }
}
static void pack25519(u8 *out, const field_elem in) {
    int i, j, carry;
    field_elem m, t;
    for (i = 0; i < 16; ++i) t[i] = in[i];
    carry25519(t); carry25519(t); carry25519(t);
    for (j = 0; j < 2; ++j) {
        m[0] = t[0] - 0xffed;
        for (i = 1; i < 15; ++i) {
            m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
            m[i - 1] &= 0xffff;
        }
        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
        carry = (m[15] >> 16) & 1;
        m[14] &= 0xffff;
        swap25519(t, m, 1 - carry);
    }
    for (i = 0; i < 16; ++i) {
        out[2*i]     = t[i] & 0xff;
        out[2*i + 1] = t[i] >> 8;
    }
}

int main(void) {
    /* 测试 1：小端字节串 "01 00 ... 00"（数字 1）round-trip 不变 */
    u8 in[32] = {1}, out[32];
    field_elem fe;
    unpack25519(fe, in);
    pack25519(out, fe);
    printf("round-trip(1): %s\n", memcmp(in, out, 32) == 0 ? "OK" : "FAIL");

    /* 测试 2：p 的编码（ff ff ... ed）归约后应变成 0 */
    u8 p_enc[32];
    memset(p_enc, 0xff, 32);
    p_enc[0] = 0xed; p_enc[31] = 0x7f;   /* p = 2^255 - 19 的小端编码 */
    unpack25519(fe, p_enc);
    pack25519(out, fe);
    printf("pack(p) == 0: %s\n", out[0] == 0 && memcmp(out, (u8[32]){0}, 32) == 0
           ? "OK" : "FAIL");
    return 0;
}
```

第二个测试展示了完整归约的意义：输入 $p$（本来就不在 $[0, p-1]$），输出 0。

## 9.7 练习

1. 手工追踪 `swap25519(t, m, 1 - carry)` 在 `carry = 0` 和 `carry = 1` 两种情况下分别做了什么。
2. 解释：为什么内层减法要“从低位到高位逐元素处理借位”，而不能像 `fsub` 那样一次性相减？提示：`fsub` 之后还要 `carry25519`，而这里每一步都要立即确定借位比特。
3. 验证测试 2：为什么 `pack(p)` 必须输出 0 而不是 `p` 本身？
4. 如果把 `pack25519` 里的 `swap25519(t, m, 1-carry)` 换成
   `if (carry == 0) t = m;` 会怎样？为什么这会破坏常数时间？
5. 思考：`pack25519` 的两次外层循环是否一定能覆盖“$t \ge 2p$”的情况？提示：$t < 2^{256}$ 而 $2p = 2^{256} - 38$，所以 $t \le 2^{256}-1$ 意味着$t - 2p \le 37$，第一次循环足以处理。

## 9.8 小结

- `swap25519` 用掩码技巧实现常数时间条件交换，是“用算术代替分支”的典范。
- `pack25519` 是唯一做完整模 $p$ 归约的函数：算 $t - p$，非负则采纳，循环两次，保证输出是 $[0, p-1]$ 的唯一规范编码。
- 至此，有限域算术全部完成：`unpack25519`、`fadd`、`fsub`、`fmul`、`finverse`、
  `pack25519`、`carry25519`、`swap25519`。

下一部分把这些工具用在椭圆曲线上：先是射影坐标下的点运算，然后是 Montgomery 阶梯。
