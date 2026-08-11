# 第 7 章：乘法

> 对应论文：§3.2 模 $p$ 乘法

## 7.1 本章要回答的问题

域乘法是 Montgomery 阶梯中最昂贵的运算（第 12 章每步要 10 次），本章把它的每个细节讲透：

1. 两个 255 位数的乘积有 510 位，怎么“塞回”16 个 limb？
2. “模 $2p$ 归约”是什么意思？为什么不像教科书那样直接模 $p$ 归约？
3. 乘法的中间结果会不会溢出 64 位？怎么证明不会？
4. 为什么乘法只需要两次 `carry25519`，而 `pack25519` 需要三次？

## 7.2 长乘法

```c
static void fmul(field_elem out, const field_elem a, const field_elem b) /* out = a * b */
{
    i64 i, j, product[31];

    for (i = 0; i < 31; ++i) product[i] = 0;

    /* 长乘法：product[i+j] 累加所有 a[i]*b[j] */
    for (i = 0; i < 16; ++i) {
        for (j = 0; j < 16; ++j) product[i+j] += a[i] * b[j];
    }

    /* 模 2p 归约：2^256 ≡ 38 (mod 2p) */
    for (i = 0; i < 15; ++i) product[i] += 38 * product[i + 16];

    /* 取低 16 个 limb 作为结果 */
    for (i = 0; i < 16; ++i) out[i] = product[i];

    carry25519(out);
    carry25519(out);
}
```

展开 (1) 中的两个表示相乘：

$$a \cdot b = \sum_{i=0}^{15} \sum_{j=0}^{15} a_i b_j \cdot 2^{16(i+j)}$$

每个 $a_i b_j$ 的贡献放在 `product[i+j]`——和小学竖式乘法一模一样，只是基数从 10
变成 $2^{16}$。交叉项的指数 $i+j$ 最大为 $30$，所以下标 $0..30$ 共 31 个槽就够了：
最重的交叉项 $a_{15}b_{15}$ 落在 $2^{480}$ 处，其值可能远超过 16 位，但 `product[30]`
作为“膨胀槽”整体承载 $2^{480}$ 以上的全部位（归约时再折叠）。因此 `product` 是 31 元素数组。

## 7.3 模 $2p$ 归约：神秘的 38 再次登场

完整的模 $p$ 归约（第 9 章的 `pack25519`）需要比较、条件减法等操作，很昂贵。好在第 1.5 节的恒等式给了捷径：

$$2^{256} = 2 \cdot (2^{255} - 19) + 38 = 2p + 38
\quad\Longrightarrow\quad 2^{256} \equiv 38 \pmod{2p}$$

`product[i+16]` 这一项代表的值是 $product[i+16] \cdot 2^{16(i+16)} = product[i+16] \cdot 2^{16i} \cdot 2^{256}$，于是

$$product[i+16] \cdot 2^{256} \equiv 38 \cdot product[i+16] \pmod{2p}$$

把 $38 \cdot product[i+16]$ 加到低位的 `product[i]` 上，就完成了“高 15 个 limb
折叠进低 16 个 limb”的归约。循环结束后，忽略 `product[16..30]`，只看
`product[0..15]`——这就是我们要的 16-limb 表示：

$$
\text{product} \equiv
(t_0 + 38t_{16}) 2^0 + (t_1 + 38t_{17}) 2^{16} + \cdots + (t_{14} + 38t_{30}) 2^{224}
+ t_{15} 2^{240} \pmod{2p} \tag{5}
$$

**为什么“模 $2p$”而不是“模 $p$”就够了**？因为模 $p$ 的倍数归约保留了模 $p$
意义下的一切信息：$a \equiv a - 2p \pmod{p}$。我们只是把数**换了一个同样合法、但更小的表示**，最终结果不会变。完全归约（到 $[0, p-1]$）推迟到 `pack25519`
再做一次即可。

注意 (5) 是“几乎”归约：元素现在能放进 16 个 limb，但**每个元素的值还很大**（例如 $t_0 + 38t_{16}$ 可能远大于 $2^{16}$）。所以要继续做进位。

## 7.4 溢出分析：64 位够不够

有符号 64 位整数的范围是 $[-2^{63}, 2^{63}-1]$。我们要证明中间值不会越界。

论文的论证（§3.2）基于一个事实：**`fmul` 的输出在成为下一次 `fmul` 的输入之前，最多经历一次 `fadd` 或 `fsub`**（这是第 12 章 Montgomery 阶梯的结构保证的）。假设 `fmul` 返回时每个元素在 $[0, 2^{16}]$ 附近（两次 `carry25519` 后确实如此），那么一次加法/减法后，乘法输入的元素满足 $a_i, b_i \in [-2^{16}, 2^{17}]$。

`product` 中累加项最多的元素是 $t_{15}$（交叉项全部汇聚于此）：

$$t_{15} = a_{15}b_0 + a_{14}b_1 + \cdots + a_1 b_{14} + a_0 b_{15}$$

每个乘积 $a_i b_j \in [-2^{33}, 2^{34}]$，16 项之和 $\in [-2^{37}, 2^{38}]$。
(5) 中的模 $2p$ 归约又可能把元素放大最多 38 倍；把 38 近似为 $2^6$（向上取），最坏情况 $\in [-2^{43}, 2^{44}]$。这远小于 $2^{63}$，所以 **64 位算术在整个乘法过程中不会溢出**。（C 语言中有符号溢出是未定义行为，这个证明是“为什么不会 UB”的保证，也是论文反复强调它的原因。）

## 7.5 为什么两次 `carry25519` 就够

把 `product[0..15]` 复制到 `out` 后，元素可能高达 $\pm 2^{44}$，必须清理：

- **第一次** `carry25519`：把所有元素压回 16 位，但末位回绕的进位可能让
  `out[0]` 再次超界；
- **第二次** `carry25519`：修复 `out[0]`。

两次之后，元素保证在 $[0, 2^{16}]$ 附近——注意是“附近”而非严格 $[0, 2^{16}-1]$：论文说第二次调用后范围可能**略微**超界（例如某个中间元素在第二次调用时收到进位，变成 $0x10000$ 附近的数）。这对 `fmul` 的目的足够：作为下一次乘法的输入时，元素 $\in [-2^{16}, 2^{17}]$ 完全符合 7.4 节的假设。

**那什么时候需要第三次**？当结果要被 `pack25519` 输出成字节时，必须保证所有元素严格在 $[0, 2^{16}-1]$（第 9 章），所以 `pack25519` 调用三次。关键纪律：**调用次数必须是常数**，不能“检查有没有进位再决定调几次”——否则就不是常数时间了。

## 7.6 C 代码：验证 2 × 3 和溢出示例

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
    carry25519(out);
    carry25519(out);
}
static void print_fe(const char *name, const field_elem fe) {
    printf("%-14s", name);
    for (int i = 0; i < 16; ++i) printf("%04llx ", (unsigned long long)(fe[i] & 0xffff));
    printf("\n");
}

int main(void) {
    u8 two_b[32] = {2}, three_b[32] = {3};
    field_elem two, three, six;
    unpack25519(two, two_b);
    unpack25519(three, three_b);
    fmul(six, two, three);
    print_fe("2 * 3", six);        /* six[0] = 6 */
    return 0;
}
```

## 7.7 练习

1. 手工展开 $t_{15}$ 的 16 项，确认 7.4 节的范围估计。
2. 用 Python 的大整数写一个参考乘法，随机生成域元素与 `fmul` 对照，验证
   1000 次随机测试都通过（这正是“延迟归约 + 模 2p”正确性的实证）。
3. 解释：为什么“完全模 $p$ 归约”在 `fmul` 里是不必要的，推迟到 `pack25519`
   不会改变最终结果？
4. 为什么 `carry25519` 的调用次数必须是常数（2 次或 3 次），而不能动态决定？
5. 思考：7.4 节的假设“乘法输入元素在 $[-2^{16}, 2^{17}]$”由谁保证？阅读第 12 章确认 Montgomery 阶梯的结构确实如此。

## 7.8 小结

- 长乘法把 510 位乘积放在 31 个 limb 里；$2^{256} \equiv 38 \pmod{2p}$ 把高 limb
  折叠回低 limb，一次循环完成模 $2p$ 归约。
- 溢出分析（最坏 $[-2^{43}, 2^{44}]$）保证 64 位槽足够，无未定义行为。
- 两次 `carry25519` 使元素回到 $[0, 2^{16}]$ 附近，满足下一次乘法的输入要求。

下一章用费马小定理实现乘法逆元——域算术的最后一个运算。
