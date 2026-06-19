# 第6章：加法和减法

## 6.1 概述

有限域上的加法和减法是椭圆曲线运算的基础。本章介绍如何在 field_elem 表示上实现这些运算。

## 6.2 有限域加法

### 数学定义

对于 field_elem 表示的两个数 $a$ 和 $b$：

$$a = a_0 2^0 + a_1 2^{16} + \cdots + a_{15} 2^{240}$$
$$b = b_0 2^0 + b_1 2^{16} + \cdots + b_{15} 2^{240}$$

它们的和为：

$$a + b = (a_0 + b_0) 2^0 + (a_1 + b_1) 2^{16} + \cdots + (a_{15} + b_{15}) 2^{240}$$

### 实现

```c
static void fadd(field_elem out, const field_elem a, const field_elem b)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = a[i] + b[i];
    }
}
```

### 特点

1. **简单直接**：逐元素相加
2. **无需进位**：使用 64 位整数，中间结果不会溢出
3. **常数时间**：固定 16 次迭代

## 6.3 有限域减法

### 数学定义

$$a - b = (a_0 - b_0) 2^0 + (a_1 - b_1) 2^{16} + \cdots + (a_{15} - b_{15}) 2^{240}$$

### 实现

```c
static void fsub(field_elem out, const field_elem a, const field_elem b)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = a[i] - b[i];
    }
}
```

### 特点

1. **简单直接**：逐元素相减
2. **可能产生负数**：中间结果可能是负的
3. **后续处理**：需要通过 carry25519 归约

## 6.4 为什么使用 64 位整数

### 溢出分析

如果我们使用 16 位整数：

```c
// 不好的实现
typedef short i16;
typedef i16 field_elem_bad[16];

void fadd_bad(field_elem_bad out, const field_elem_bad a, const field_elem_bad b) {
    for (int i = 0; i < 16; i++) {
        out[i] = a[i] + b[i];  // 可能溢出！
    }
}
```

问题：$a_i + b_i$ 可能超过 16 位范围 $[-32768, 32767]$。

### 使用 64 位整数的优势

```c
// 好的实现
typedef long long i64;
typedef i64 field_elem[16];

void fadd(field_elem out, const field_elem a, const field_elem b) {
    for (int i = 0; i < 16; i++) {
        out[i] = a[i] + b[i];  // 不会溢出
    }
}
```

优势：
1. **安全**：中间结果不会溢出
2. **简单**：不需要处理进位
3. **高效**：现代 CPU 对 64 位运算优化好

## 6.5 模 $p$ 归约

### 问题

加法和减法的结果可能不在 $[0, p-1]$ 范围内。

### 解决方案

1. **允许中间结果超出范围**：field_elem 元素可以是负数或大于 $2^{16}$
2. **延迟归约**：在需要时通过 carry25519 归约
3. **确保最终结果正确**：在输出前进行归约

### 示例

```c
// 加法后可能需要归约
field_elem a, b, c;
fadd(c, a, b);
carry25519(c);  // 归约到合理范围
```

## 6.6 完整代码示例

```c
#include <stdio.h>

typedef unsigned char u8;
typedef long long i64;
typedef i64 field_elem[16];

// unpack25519 实现
static void unpack25519(field_elem out, const u8 *in)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = in[2*i] + ((i64) in[2*i + 1] << 8);
    }
    out[15] &= 0x7fff;
}

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

// 加法实现
static void fadd(field_elem out, const field_elem a, const field_elem b)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = a[i] + b[i];
    }
}

// 减法实现
static void fsub(field_elem out, const field_elem a, const field_elem b)
{
    int i;
    for (i = 0; i < 16; ++i) {
        out[i] = a[i] - b[i];
    }
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
    // 示例：计算 1 + 1
    u8 one_bytes[32] = {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    
    field_elem a, b, c;
    unpack25519(a, one_bytes);
    unpack25519(b, one_bytes);
    
    printf("计算 1 + 1:\n");
    print_field_elem("a", a);
    print_field_elem("b", b);
    
    fadd(c, a, b);
    print_field_elem("c = a + b (未归约)", c);
    
    carry25519(c);
    print_field_elem("c = a + b (归约后)", c);
    
    // 示例：计算 2 - 1
    printf("\n计算 2 - 1:\n");
    field_elem two, result;
    
    u8 two_bytes[32] = {2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    unpack25519(two, two_bytes);
    
    print_field_elem("two", two);
    print_field_elem("one", a);
    
    fsub(result, two, a);
    print_field_elem("result = two - one (未归约)", result);
    
    carry25519(result);
    print_field_elem("result = two - one (归约后)", result);
    
    return 0;
}
```

## 6.7 性能考虑

### 优化机会

1. **循环展开**：手动展开 16 次迭代
2. **SIMD 指令**：使用向量化指令并行处理
3. **内存对齐**：确保 field_elem 对齐到缓存行

### 常数时间保证

1. **无分支**：代码中没有条件分支
2. **固定迭代**：总是执行 16 次循环
3. **无数据依赖**：执行时间不依赖于输入值

## 6.8 练习

1. 实现 fadd 和 fsub 函数，并验证其正确性。
2. 解释为什么加法和减法不需要立即归约。
3. 分析加法和减法的时间复杂度。
4. 设计一个测试用例，验证加法和减法的正确性。

## 6.9 小结

有限域的加法和减法是椭圆曲线运算的基础。通过使用 64 位整数和 field_elem 表示，我们可以简单高效地实现这些运算。

在下一章中，我们将实现有限域的乘法运算，这是更复杂的操作。