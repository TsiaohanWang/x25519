# 第7章：乘法

## 7.1 概述

有限域乘法是椭圆曲线运算中最复杂的操作之一。本章介绍如何高效实现模 $p$ 乘法。

## 7.2 长乘法算法

### 数学原理

对于 field_elem 表示的两个数 $a$ 和 $b$：

$$a = a_0 2^0 + a_1 2^{16} + \cdots + a_{15} 2^{240}$$
$$b = b_0 2^0 + b_1 2^{16} + \cdots + b_{15} 2^{240}$$

它们的乘积为：

$$a \cdot b = \sum_{i=0}^{15} \sum_{j=0}^{15} a_i b_j \cdot 2^{16(i+j)}$$

### 实现思路

1. **初始化**：创建 31 元素的数组 product，初始化为 0
2. **累加**：遍历所有 $i, j$，将 $a_i b_j$ 加到 product[i+j]
3. **归约**：将 31 元素数组归约到 16 元素

## 7.3 fmul 函数实现

```c
static void fmul(field_elem out, const field_elem a, const field_elem b)
{
    i64 i, j, product[31];
    
    // 初始化
    for (i = 0; i < 31; ++i) product[i] = 0;
    
    // 长乘法
    for (i = 0; i < 16; ++i) {
        for (j = 0; j < 16; ++j) {
            product[i+j] += a[i] * b[j];
        }
    }
    
    // 模 2p 归约
    for (i = 0; i < 15; ++i) {
        product[i] += 38 * product[i + 16];
    }
    
    // 复制结果
    for (i = 0; i < 16; ++i) {
        out[i] = product[i];
    }
    
    // 进位处理
    carry25519(out);
    carry25519(out);
}
```

## 7.4 模 2p 归约

### 为什么需要归约

乘积 $a \cdot b$ 是 510 位的数，需要归约到 255 位。

### 归约原理

因为 $2^{256} = 2p + 38$，所以：

$$2^{256} \equiv 38 \pmod{2p}$$

对于 product[i+16]，它代表的值是 $product[i+16] \cdot 2^{16(i+16)} = product[i+16] \cdot 2^{16i} \cdot 2^{256}$。

因此：

$$product[i+16] \cdot 2^{256} \equiv product[i+16] \cdot 38 \pmod{2p}$$

### 实现

```c
for (i = 0; i < 15; ++i) {
    product[i] += 38 * product[i + 16];
}
```

## 7.5 溢出分析

### 输入范围

假设乘法输入的每个元素在 $[-2^{16}, 2^{17}]$ 范围内。

### 乘积范围

对于 product[15]（最坏情况）：

$$t_{15} = a_{15} b_0 + a_{14} b_1 + \cdots + a_0 b_{15}$$

每个 $a_i b_j$ 在 $[-2^{33}, 2^{34}]$ 范围内，16 项之和在 $[-2^{37}, 2^{38}]$ 范围内。

### 归约后范围

乘以 38 后，范围变为 $[-2^{43}, 2^{44}]$。

### 64 位整数足够

64 位有符号整数的范围是 $[-2^{63}, 2^{63}-1]$，远大于 $[-2^{43}, 2^{44}]$。

## 7.6 进位处理

### 为什么需要两次 carry25519

1. **第一次**：处理模 2p 归约产生的进位
2. **第二次**：处理第一次进位可能引入的新进位

### 示例

```c
// 乘法后调用两次 carry25519
fmul(out, a, b);
// out 现在包含乘积，但元素可能超出 [0, 2^16 - 1] 范围
```

## 7.7 完整代码示例

```c
#include <stdio.h>

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

// carry25519 实现
static void carry25519(field_elem elem)
{
    int i;
    i64 carry;
    for (i = 0; i < 16; ++i) {
        carry = elem[i] >> 16;
        elem[i] -= carry << 16;
        if (i < 15) elem[i + 1] += carry;
        else elem[0] += 38 * carry;
    }
}

// 乘法实现
static void fmul(field_elem out, const field_elem a, const field_elem b)
{
    i64 i, j, product[31];
    
    for (i = 0; i < 31; ++i) product[i] = 0;
    
    for (i = 0; i < 16; ++i) {
        for (j = 0; j < 16; ++j) {
            product[i+j] += a[i] * b[j];
        }
    }
    
    for (i = 0; i < 15; ++i) {
        product[i] += 38 * product[i + 16];
    }
    
    for (i = 0; i < 16; ++i) {
        out[i] = product[i];
    }
    
    carry25519(out);
    carry25519(out);
}

// unpack25519 实现
static void unpack25519(field_elem out, const u8 *in)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = in[2*i] + ((i64) in[2*i + 1] << 8);
    }
    out[15] &= 0x7fff;
}

// 打印 field_elem
void print_field_elem(const char *name, const field_elem fe)
{
    printf("%s: ", name);
    for (int i = 0; i < 16; i++) {
        printf("%04llx ", fe[i] & 0xffff);
    }
    printf("\n");
}

int main()
{
    // 示例：计算 2 * 3
    u8 two_bytes[32] = {2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    u8 three_bytes[32] = {3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                           0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    
    field_elem a, b, c;
    unpack25519(a, two_bytes);
    unpack25519(b, three_bytes);
    
    printf("计算 2 * 3:\n");
    print_field_elem("a", a);
    print_field_elem("b", b);
    
    fmul(c, a, b);
    print_field_elem("c = a * b", c);
    
    return 0;
}
```

## 7.8 性能优化

### 优化机会

1. **Karatsuba 算法**：减少乘法次数
2. **SIMD 指令**：并行计算多个乘积
3. **汇编优化**：针对特定 CPU 优化

### 常数时间保证

1. **无分支**：代码中没有条件分支
2. **固定迭代**：总是执行相同的循环次数
3. **无数据依赖**：执行时间不依赖于输入值

## 7.9 练习

1. 实现 fmul 函数，并验证其正确性。
2. 解释为什么需要模 2p 归约而不是模 p 归约。
3. 分析乘法的时间复杂度。
4. 设计一个测试用例，验证乘法的正确性。

## 7.10 小结

有限域乘法是椭圆曲线运算中最复杂的操作。通过使用长乘法算法和模 2p 归约，我们可以高效地实现乘法。

在下一章中，我们将实现乘法逆元，这是除法运算的基础。