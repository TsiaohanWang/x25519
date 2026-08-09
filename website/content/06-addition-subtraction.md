# 第 6 章：加法和减法

> 对应论文：§3.1 加法与减法

## 6.1 本章要回答的问题

有了 `field_elem` 表示，域加法和减法几乎平凡。但两个问题值得认真回答：

1. 为什么 `fadd`/`fsub` 可以"不算进位、不归约"？
2. "延迟归约"（deferred reduction）到底是什么策略？它和常数时间有什么关系？

## 6.2 实现

```c
static void fadd(field_elem out, const field_elem a, const field_elem b) /* out = a + b */
{
    int i;
    for (i = 0; i < 16; ++i) out[i] = a[i] + b[i];
}

static void fsub(field_elem out, const field_elem a, const field_elem b) /* out = a - b */
{
    int i;
    for (i = 0; i < 16; ++i) out[i] = a[i] - b[i];
}
```

就这么简单：逐元素相加/相减。由表示 (1)：

$$a + b = (a_0 + b_0) 2^0 + (a_1 + b_1) 2^{16} + \cdots + (a_{15} + b_{15}) 2^{240}$$

逐元素运算恰好实现了这个式子——**元素之间的进位被"推迟"了**：`a[0] + b[0]` 可能超过
$2^{16}$，但我们不去处理，直接把这个值留在 `out[0]` 里。因为元素是 64 位有符号整数，
而 $a_i, b_i$ 通常在 $[0, 2^{16}]$ 附近（或经过一次运算后略大），加法/减法根本不会
溢出或下溢 64 位。这就是"延迟归约"的第一个体现：

> **先算，不归约；等元素涨到可能溢出时，再用 `carry25519` 一次性清理。**

## 6.3 延迟归约：什么时候归约？

所有域运算都在 $[0, p-1]$ 之外进行，只要满足：

1. **最终结果模 $p$ 正确**（提前归约不改变结果，第 1.3 节）；
2. **中间值不溢出 64 位槽**。

具体到 X25519 的实现，运算的顺序是精心安排的（论文 §4.6 会详细分析）：

- `fadd`/`fsub` 的输入通常是上一次 `fmul` 的输出（元素在 $[0, 2^{16}]$ 附近）
  或另一次 `fadd`/`fsub` 的输出；
- 乘法 `fmul` 内部对输入的要求是元素在 $[-2^{16}, 2^{17}]$ 范围内（第 7 章分析），
  所以"加法/减法之后直接进入乘法"是安全的；
- 只有当需要把值写回字节数组（`pack25519`）时，才做完整的模 $p$ 归约。

这样，整个 Montgomery 阶梯（第 12 章）中，**只有少数几个点**做真正的归约，大部分
运算都是廉价的逐元素加减乘。

## 6.4 为什么这对常数时间很重要

考虑一个朴素实现：每次加法后检查 `if (out[i] >= p) out[i] -= p;`。这个分支的执行
时间取决于数据，而数据包含秘密。时序攻击（timing attack）正是利用这种差异来逐位
恢复秘密。**常数时间**要求：执行时间与输入值无关。

`fadd`/`fsub` 完美满足：

- 无分支（只有循环，循环次数固定 16）；
- 无数据相关的内存访问（数组索引都是公开的常量偏移）；
- 每条指令的执行时间与操作数值无关（现代 CPU 的整数运算如此）。

`carry25519` 里的 `if (i < 15)` 也安全，因为它只依赖公开的 $i$。这是贯穿全书的
准则：**分支只能由公开信息决定，秘密数据只能通过算术/位运算处理。**

## 6.5 C 代码：验证

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
static void fadd(field_elem out, const field_elem a, const field_elem b) {
    int i; for (i = 0; i < 16; ++i) out[i] = a[i] + b[i];
}
static void fsub(field_elem out, const field_elem a, const field_elem b) {
    int i; for (i = 0; i < 16; ++i) out[i] = a[i] - b[i];
}
static void print_fe(const char *name, const field_elem fe) {
    printf("%-20s", name);
    for (int i = 0; i < 16; ++i) printf("%04llx ", (unsigned long long)(fe[i] & 0xffff));
    printf("\n");
}

int main(void) {
    u8 one[32] = {1}, two[32] = {2};
    field_elem a, b, c;
    unpack25519(a, one); unpack25519(b, one);
    fadd(c, a, b);
    print_fe("1 + 1（未归约）", c);     /* c[0] = 2 */
    carry25519(c);
    print_fe("1 + 1（归约后）", c);     /* 仍是 2 */

    unpack25519(b, two);
    fsub(c, b, a);                     /* 2 - 1 */
    print_fe("2 - 1（未归约）", c);     /* c[0] = 1 */
    carry25519(c);
    print_fe("2 - 1（归约后）", c);     /* 仍是 1 */
    return 0;
}
```

> 练习观察：把 `fadd(a, b)` 的结果打印出来，可以看到如果 `a[0] + b[0] > 0xffff`，
> 未归约时 `c[0]` 会超过 16 位——这是**故意的**，`carry25519` 会把它拆回正确的
> 16 位表示。这个"先膨胀再清理"正是延迟归约的全部含义。

## 6.6 练习

1. 解释为什么 `fadd` 可以不用进位处理，而小学竖式加法必须处理进位。
2. 如果元素用 16 位 `short` 而不是 64 位，`fadd` 会出什么问题？用一个具体例子说明。
3. 分析 `fadd` 的时间复杂度，并说明它为什么是常数时间。
4. 设计一个验证 `fadd`/`fsub` 正确性的测试：随机生成域元素、用大整数参考实现
   对比（提示：本仓库的 `test.c` 用 RFC 向量做端到端验证，也可以临时写一个小程序
   用 Python 的大整数对照）。
5. 思考：`fsub` 的结果可能是负数元素。负数元素对后续 `fmul` 有什么影响？
   （提示：第 7 章的溢出分析会给出答案。）

## 6.7 小结

- `fadd`/`fsub` 是逐元素运算，故意不做进位处理——延迟归约策略的第一步。
- 归约的时机由"是否接近溢出"和"是否需要规范结果"决定，而不是每步都做。
- 常数时间 = 无数据依赖分支 + 固定循环次数 + 固定内存访问模式。

下一章实现域乘法，那里归约（38）和溢出分析才是重头戏。
