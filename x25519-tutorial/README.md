# X25519 椭圆曲线密码学从零实现教程

本教程基于 Martin Kleppmann 的论文《Implementing Curve25519/X25519: A Tutorial on
Elliptic Curve Cryptography》，从最基础的数学概念出发，一步步推导并实现 X25519
Diffie-Hellman 密钥交换算法。教程的最终目标是让你能够**亲手写出并理解** `x25519.c`
中的每一行代码：它为什么是这样、为什么是常数时间的、以及它与论文和 RFC 7748 的关系。


## 教程结构

每一章开头都标注了与论文章节的对应关系，方便对照原文。

### 第一部分：数学基础（对应论文第 2 章与 §4.1–4.3）

1. **[模运算与同余](01-modular-arithmetic.md)** —— 为什么密码学要在模运算中进行，
   `p = 2^255 - 19` 的特殊形式。
2. **[群](02-group-theory.md)** —— 群公理、有限群、循环群、Diffie-Hellman 协议与离散对数、CDH/DDH 假设。
3. **[有限域](03-finite-fields.md)** —— 域公理、素数域 `Z_p`、费马小定理与乘法逆元、为什么扩展欧几里得算法不适合密码学。
4. **[椭圆曲线群](04-elliptic-curves.md)** —— 直线与曲线的第三交点、群律的构造、
   Montgomery 曲线、Curve25519 的参数、余因子与小子群攻击。

### 第二部分：有限域算术实现（对应论文第 3 章）

5. **[数据表示](05-data-representation.md)** —— 字节数组与 16-limb 的 `field_elem`
   表示、`unpack25519`/`pack25519`/`carry25519` 概览。
6. **[加法和减法](06-addition-subtraction.md)** —— `fadd`/`fsub` 与“延迟归约”思想。
7. **[乘法](07-multiplication.md)** —— 长乘法、模 `2p` 归约（神秘的 38）、溢出分析、为什么需要两次 `carry25519`。
8. **[乘法逆元](08-multiplicative-inverse.md)** —— 费马小定理、平方-乘法、
   `finverse` 如何利用 `p - 2` 的二进制结构。
9. **[打包与解包](09-pack-unpack.md)** —— `pack25519` 的常数时间模 `p` 归约、
   `swap25519` 常数时间交换。

### 第三部分：椭圆曲线算术（对应论文第 4 章）

10. **[Curve25519 曲线与安全参数](10-curve-equation.md)** —— Montgomery 曲线方程、群阶、基点、为什么选这些参数。
11. **[点加法与射影坐标](11-point-addition.md)** —— 仿射坐标公式、射影坐标、只用 `x` 坐标的差分加法与点倍增公式推导。
12. **[标量乘法与 Montgomery 阶梯](12-scalar-multiplication.md)** —— 阶梯算法、常数时间性、10 次乘法的优化分解（论文 §4.6 的 `v1`–`v18`）、无穷远点的自动处理。

### 第四部分：X25519 实现（对应论文 §4.7–4.8 与 RFC 7748）

13. **[密钥生成](13-key-generation.md)** —— 随机数与钳位处理（三个比特各自的理由）。
14. **[密钥交换](14-key-exchange.md)** —— Diffie-Hellman 协议、`x25519` 函数的完整流程、RFC 7748 §6.1 测试向量。
15. **[完整实现](15-complete-implementation.md)** —— 逐行讲解 `x25519.c`，从 `unpack25519` 到 `pack25519` 的全流程串联。
16. **[代码清单与测试](16-code-listings.md)** —— 全部源码、Makefile、编译运行、
    RFC 7748 §5.2 标量乘测试向量。
17. **[常数时间与侧信道攻击](17-constant-time.md)** —— 时序攻击原理、三大泄露渠道、
    X25519 各函数的常数时间手段全景表、常见错误与验证方法。

## 快速开始

```bash
cd x25519-tutorial

# 编译并运行测试（随机密钥交换 + RFC 7748 全部测试向量）
make
./test

# 单独验证 RFC 7748 §5.2 / §6.1 测试向量（位于仓库根目录）
cd ..
gcc -O2 -Wall -Wextra -o rfc7748_check rfc7748_check.c x25519-tutorial/x25519.c
./rfc7748_check
```

预期输出：所有测试通过（`ALL PASS` 或逐项 `PASS`）。

## 仓库结构

```
x25519/
├── curve25519.pdf          论文 PDF
├── curve25519.md          论文转录文本（英文）
├── curve25519-zh.md       论文转录文本（中文）
├── rfc7748_check.c        RFC 7748 测试向量验证程序
└── x25519-tutorial/
    ├── README.md          本文件
    ├── 01~16*.md          教程正文
    ├── x25519.h           头文件
    ├── x25519.c           完整实现（教程的最终成果）
    ├── test.c             测试程序（RFC 7748 全部向量）
    └── Makefile
```

## 参考文献

1. Martin Kleppmann. *Implementing Curve25519/X25519: A Tutorial on Elliptic Curve
   Cryptography.*（本教程所依据的论文，仓库内有 PDF 与中英文转录）
2. Daniel J. Bernstein. *Curve25519: new Diffie-Hellman speed records.* PKC 2006.
3. A. Langley, M. Hamburg, S. Turner. *RFC 7748: Elliptic Curves for Security.* 2016.
4. Daniel J. Bernstein, et al. *TweetNaCl: A Crypto Library in 100 Tweets.*
   LATINCRYPT 2014.（本文分析的 C 实现的原始出处）
5. Daniel J. Bernstein, Tanja Lange. *Montgomery Curves and the Montgomery Ladder.*

## 许可证

教程正文与代码基于 Kleppmann 论文与 TweetNaCl，均为可自由使用的内容；本仓库代码遵循公共领域（public domain）许可。
