# 第2章：群论基础

## 2.1 群的定义

群是抽象代数中的基本结构，它为椭圆曲线密码学提供了数学基础。

### 定义

一个群是一个集合 $G$ 加上一个二元运算 $\bullet$，满足以下四个公理：

1. **封闭性**：对于所有 $a, b \in G$，有 $a \bullet b \in G$
2. **结合律**：对于所有 $a, b, c \in G$，有 $(a \bullet b) \bullet c = a \bullet (b \bullet c)$
3. **单位元**：存在元素 $e \in G$，使得对于所有 $a \in G$，有 $e \bullet a = a \bullet e = a$
4. **逆元**：对于每个 $a \in G$，存在元素 $a^{-1} \in G$，使得 $a \bullet a^{-1} = a^{-1} \bullet a = e$

### 示例

**整数加法群** $(\mathbb{Z}, +)$：
- 集合：所有整数
- 运算：加法
- 单位元：0
- 逆元：$a$ 的逆元是 $-a$

**非零实数乘法群** $(\mathbb{R}^*, \cdot)$：
- 集合：所有非零实数
- 运算：乘法
- 单位元：1
- 逆元：$a$ 的逆元是 $\frac{1}{a}$

## 2.2 阿贝尔群

### 定义

如果群还满足交换律，则称为阿贝尔群（或交换群）：

**交换律**：对于所有 $a, b \in G$，有 $a \bullet b = b \bullet a$

### 示例

- $(\mathbb{Z}, +)$ 是阿贝尔群
- $(\mathbb{R}^*, \cdot)$ 是阿贝尔群
- 矩阵乘法群通常不是阿贝尔群

## 2.3 有限群

### 定义

如果群 $G$ 的元素个数有限，则称为有限群。群的阶（order）是群中元素的个数，记作 $|G|$。

### 示例

**模 $n$ 整数加法群** $(\mathbb{Z}_n, +)$：
- 集合：$\{0, 1, 2, \ldots, n-1\}$
- 运算：模 $n$ 加法
- 单位元：0
- 逆元：$a$ 的逆元是 $n - a$
- 阶：$n$

```c
// 模 n 整数加法群示例
typedef struct {
    int value;
    int modulus;
} ModInt;

ModInt mod_add(ModInt a, ModInt b) {
    ModInt result;
    result.modulus = a.modulus;
    result.value = (a.value + b.value) % a.modulus;
    return result;
}

ModInt mod_inverse(ModInt a) {
    ModInt result;
    result.modulus = a.modulus;
    result.value = (a.modulus - a.value) % a.modulus;
    return result;
}
```

## 2.4 循环群

### 定义

如果存在元素 $g \in G$，使得 $G = \{g^0, g^1, g^2, \ldots, g^{|G|-1}\}$，则称 $G$ 为循环群，$g$ 为生成元（generator）。

### 性质

1. 循环群一定是阿贝尔群
2. 循环群的生成元不唯一
3. 素数阶群一定是循环群

### 示例

**模 7 整数乘法群** $(\mathbb{Z}_7^*, \cdot)$：
- 集合：$\{1, 2, 3, 4, 5, 6\}$
- 运算：模 7 乘法
- 阶：6
- 生成元：3（因为 $3^1=3, 3^2=2, 3^3=6, 3^4=4, 3^5=5, 3^6=1$）

## 2.5 群元素的阶

### 定义

群元素 $a$ 的阶是满足 $a^k = e$ 的最小正整数 $k$。

### 性质

1. 元素的阶整除群的阶
2. 素数阶群中，除单位元外所有元素的阶都等于群的阶

### 代码示例

```c
#include <stdio.h>

// 计算群元素的阶
int element_order(int a, int n) {
    int power = 1;
    int order = 0;
    
    do {
        power = (power * a) % n;
        order++;
    } while (power != 1);
    
    return order;
}

int main() {
    int n = 7;
    
    printf("模 %d 乘法群中各元素的阶：\n", n);
    for (int a = 1; a < n; a++) {
        printf("元素 %d 的阶：%d\n", a, element_order(a, n));
    }
    
    return 0;
}
```

## 2.6 拉格朗日定理

### 定理

如果 $H$ 是有限群 $G$ 的子群，则 $|H|$ 整除 $|G|$。

### 推论

1. 群中任意元素的阶整除群的阶
2. 对于群中任意元素 $a$，有 $a^{|G|} = e$

## 2.7 群在密码学中的应用

### 离散对数问题

在循环群中，给定 $g$ 和 $g^k$，计算 $k$ 是困难的。这称为离散对数问题（DLP）。

### Diffie-Hellman 密钥交换

基于离散对数问题的困难性，可以实现安全的密钥交换：

1. Alice 和 Bob 约定群 $G$ 和生成元 $g$
2. Alice 选择私钥 $a$，计算公钥 $A = g^a$
3. Bob 选择私钥 $b$，计算公钥 $B = g^b$
4. Alice 和 Bob 交换公钥
5. Alice 计算共享密钥 $S = B^a = g^{ab}$
6. Bob 计算共享密钥 $S = A^b = g^{ab}$

## 2.8 练习

1. 验证以下集合是否构成群：
   - 偶数集合关于加法
   - 正有理数集合关于乘法
   - 模 5 整数集合关于乘法

2. 找出模 11 乘法群的所有生成元。

3. 证明：素数阶群一定是循环群。

## 2.9 小结

群论为椭圆曲线密码学提供了抽象的数学框架。通过理解群的性质，我们可以更好地理解椭圆曲线上的运算。

在下一章中，我们将学习有限域，它是群论的一个重要应用，也是 Curve25519 实现的基础。