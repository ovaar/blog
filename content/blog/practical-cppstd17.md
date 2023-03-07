+++
date = "2023-03-06"
title = "Practical cppstd 17 highlights by example"
type = "post"
categories = ["Development"]
tags = ["Development", "C++"]
+++

# Practical cppstd 17 highlights by example

-   [Language Features](#language-features)
-   [Library Features](#library-features)


## Language Features

### Nested namespace definitions

```cpp
namespace A::B::C {
   // ...
}

// Rather than:
namespace A {
    namespace B {
        namespace C {
            // ...
        }
    }
}
```

### Structured bindings

```cpp
#include <map>
#include <string>
#include <iostream>

struct Vector3
{
    float X;
    float Y;
    float Z;
};
using MappingPair = std::pair<int, std::string>;

int main()
{
    const auto [x, y, z] = Vector3{1.0f, 1.0f, 1.0f};
    std::map<int, std::string> mapping
    {
        {1, "one"},
        {2, "two"}
    };
    const auto [it, isInserted] = mapping.insert(MappingPair{3, "three"});
    std::cout << it->first << " " << it->second << "\n\n";

    for (const auto& [key, value] : mapping)
    {
        std::cout << key << " " << value << std::endl;
    }
}
```

### Selection statements with initializer

```cpp
{
  std::lock_guard<std::mutex> lk(mx);
  if (v.empty()) v.push_back(val);
}
// vs.
if (std::lock_guard<std::mutex> lk(mx); v.empty()) {
  v.push_back(val);
}
```

### constexpr if

```cpp
template <typename T>
constexpr bool isIntegral() {
  if constexpr (std::is_integral<T>::value) {
    return true;
  } else {
    return false;
  }
}
static_assert(isIntegral<int>() == true);
static_assert(isIntegral<char>() == true);
static_assert(isIntegral<double>() == false);
struct S {};
static_assert(isIntegral<S>() == false);
```


### Class template argument deduction

```cpp
auto pair = std::pair{1.0, "foo"}; // Deduces to std::pair<double, std::string>;
```

### [[fallthrough]], [[nodiscard]], [[maybe_unused]] attributes

* [[fallthrough]] indicates to the compiler that falling through in a switch statement is intended behavior. This attribute may only be used in a switch statement, and must be placed before the next case/default label.


```cpp
switch (n) {
  case 1: 
    // ...
    [[fallthrough]];
  case 2:
    // ...
    break;
  case 3:
    // ...
    [[fallthrough]];
  default:
    // ...
}
```

* [[nodiscard]] issues a warning when either a function or class has this attribute and its return value is discarded.

```cpp
[[nodiscard]] bool do_something() {
  return is_success; // true for success, false for failure
}

do_something(); // warning: ignoring return value of 'bool do_something()',
                // declared with attribute 'nodiscard'
```

```cpp
// Only issues a warning when `error_info` is returned by value.
struct [[nodiscard]] error_info {
  // ...
};

error_info do_something() {
  error_info ei;
  // ...
  return ei;
}

do_something(); // warning: ignoring returned value of type 'error_info',
                // declared with attribute 'nodiscard'
```

* [[maybe_unused]] indicates to the compiler that a variable or parameter might be unused and is intended.

```cpp
void my_callback(std::string msg, [[maybe_unused]] bool error) {
  // Don't care if `msg` is an error message, just log it.
  log(msg);
}
```

## Library Features

### std::variant

```cpp
#include <variant>
#include <string>
#include <iostream>
#include <type_traits>

using SettingVarT = std::variant<int, std::string>;


class SettingVisitorWithClosure
{
public:
    SettingVisitorWithClosure(const std::string& str)
        : _str(str)
    {
    } 

    void operator()(int args)
    {
        std::cout << _str << " integer " << args << std::endl;
    }

    void operator()(std::string args)
    {
        std::cout << _str << " string " << args << std::endl;
    }

private:
    std::string _str = "Hello";
};

int main ()
{ 
    SettingVarT setting = 0;

    ////////////////////////////////////////////////////////////////////////////////
    // Lambda std::variant visitor without closure
    std::visit([](auto&& args)
    {
        using T = std::decay_t<decltype(args)>;

        if constexpr (std::is_same_v<T, int>)
        {
            std::cout << "integer " << args << std::endl;
        }
        if constexpr (std::is_same_v<T, std::string>)
        {
            std::cout << "string" << args << std::endl;
        }
    }, setting);

    ////////////////////////////////////////////////////////////////////////////////
    // Variant visitor with closure
    SettingVisitorWithClosure closure("Hello");
    std::visit(std::move(closure), setting);
}
```

### std::optional

characteristics: value-type
common use case: return value of a function that may fail.

```cpp
#include <optional>
#include <string>
#include <iostream>

std::optional<std::string> GetEvenString(int number)
{
    if ((number % 2) == 0)
    {
        return "Even";
    }
    return std::nullopt;
}

int main ()
{
    std::optional<std::string> evenOpt = std::nullopt;
    std::cout << evenOpt.value_or("empty") << std::endl;
    evenOpt = GetEvenString(2);
    std::cout << evenOpt.value() << std::endl;
    if (auto str = GetEvenString(2))
    {
        std::cout << "branch" << std::endl;
    }
}
```

### std::string_view

characteristics: value-type
description: Unlike std::string, which keeps its own copy of the string, std::string_view provides a view of a string that is defined elsewhere. 
common use case: Optimization when parsing.

```cpp
#include <string_view>
#include <string>
#include <iostream>

constexpr std::string_view MY_BEARD = "beard";

int main ()
{
    std::string str { "   trim me" };
    std::string_view view { str };
    view.remove_prefix(std::min(view.find_first_not_of(" "), view.size()));
    std::cout << str << std::endl; //  == "   trim me"
    std::cout << view << std::endl; // == "trim me"
    std::cout << view << " " << MY_BEARD << std::endl; // == "trim me beard"
}
```

### std::filesystem

```cpp
#include <filesystem>
#include <string>
#include <iostream>

namespace fs = std::filesystem;

void DisplayFileInfo(const fs::path& pathToShow, const std::string& indentation, const std::string& filename)
{
    // ...
}

void DisplayDirTree(const fs::path& pathToShow, int level)
{
    if (fs::exists(pathToShow) && fs::is_directory(pathToShow))
    {
        auto indent = std::string(level * 3, ' ');
        for (const auto& entry : fs::directory_iterator(pathToShow))
        {
            auto filename = entry.path().filename();
            if (fs::is_directory(entry.status()))
            {
                std::cout << indent << "[+] " << filename << "\n";
                DisplayDirTree(entry, level + 1);
                std::cout << "\n";
            }
            else if (fs::is_regular_file(entry.status()))
            {
                DisplayFileInfo(entry, indent, filename);
            }
            else
            {
                std::cout << indent << " [?]" << filename << "\n";
            }
        }
    }
}

void DisplayDirectoryTree(const fs::path& pathToShow)
{
    DisplayDirTree(pathToShow, 0);
}

int main ()
{
    fs::path p1("C:\\temp");
    p1 /= "user";
    p1 /= "data";

    fs::path p2("C:\\temp\\");
    p2 += "user";
    p2 += "data";

    std::cout << p1 << std::endl;
    std::cout << p2 << std::endl;

    const auto currentPath = fs::temp_directory_path();
    DisplayDirectoryTree(currentPath);
}
```

### std::byte

Unlike `char` and `unsigned char` `std::byte` is not a character or arithmetic type. A byte is a collection of bits that only allows bitwise operations.

```cpp
#include <iostream>
#include <cstddef>
#include <bitset>
 
std::ostream& operator<< (std::ostream& os, std::byte b) {
    return os << std::bitset<8>(std::to_integer<int>(b));
}
 
int main()
{
    std::byte b{42};
    std::cout << "1. " << b << '\n';
 
    // b *= 2 compilation error
    b <<= 1;
    std::cout << "2. " << b << '\n';
 
    b >>= 1;
    std::cout << "3. " << b << '\n';
 
    std::cout << "4. " << (b << 1) << '\n';
    std::cout << "5. " << (b >> 1) << '\n';
 
    b |= std::byte{0b11110000};
    std::cout << "6. " << b << '\n';
 
    b &= std::byte{0b11110000};
    std::cout << "7. " << b << '\n';
 
    b ^= std::byte{0b11111111};
    std::cout << "8. " << b << '\n';
}

// Output:
// 1. 00101010
// 2. 01010100
// 3. 00101010
// 4. 01010100
// 5. 00010101
// 6. 11111010
// 7. 11110000
// 8. 00001111
```

### Splicing maps and sets

> You will now be able to directly move internal nodes from one node-based container directly into another container of the same type. Why is that important? Because it guarantees no memory allocation overhead, no copying of keys or values, and even no exceptions if the container’s comparison function doesn’t throw.

New methods:

* std::map::extract
* std::map::merge
* std::set::extract
* std::set::merge


```cpp
#include <set>
#include <map>
#include <iostream>
#include <iterator>
#include <string>

template <typename K, typename V>
std::ostream& operator<<(std::ostream& o, const std::pair<K,V>& p)
{
  return o << "{" << p.first << ":" << p.second << "}";
}

template <typename T>
struct collection_type;

template <template <typename> typename Collection, typename T>
struct collection_type<Collection<T>>
{
    using type = T;
};

template <typename T>
using collection_type_t = typename collection_type<T>::type;

template <typename Collection>
void print_collection(const Collection& c)
{
    std::ostream_iterator<collection_type_t<Collection>> out_it(std::cout, " ");
    std::copy(c.cbegin(), c.cend(), out_it);
    std::cout << std::endl;
}

template <template <typename...> class MapT, class K, class V>
void print_collection(const MapT<K, V>& map)
{
    for (auto&& pair : map)
        std::cout << pair << " ";
    std::cout << std::endl;
}

int main()
{
    // 1. Merge two containers
    std::set<int> src {1, 3, 5};
    std::set<int> dst {2, 4, 5};
    dst.merge(src);

    print_collection(dst);
    print_collection(src);

    // 2. Changing element node key
    std::map<int, std::string> m {{1, "one"}, {2, "two"}, {3, "three"}};
    print_collection(m);
    auto nodeHandle = m.extract(2); // {2, "two"}
    
    print_collection(m);
    if (!nodeHandle.empty())
    {
        nodeHandle.key() = 4;
        m.insert(std::move(nodeHandle));
    }
    print_collection(m);
}
```

### Parallel algorithms

```cpp
#include <algorithm>
#include <vector>

int main()
{
    std::vector<Viewer::EntityHandle> entities; // Long list of entities.
    // Sort using parallel execution policy
    std::sort(std::execution::par, entities.begin(), entities.end());
    // Sort using sequential execution policy
    std::sort(std::execution::seq, entities.begin(), entities.end());
}
```

### std::not_fn

```cpp
#include <functional>
#include <algorithm>
#include <vector>
#include <iostream>
#include <iterator>

int main()
{
    const std::ostream_iterator<int> ostream_it{ std::cout, " " };
    const auto is_even = [](const auto n) { return n % 2 == 0; };
    std::vector<int> v{ 0, 1, 2, 3, 4 };

    // Print all even numbers.
    std::copy_if(std::cbegin(v), std::cend(v), ostream_it, is_even); // 0 2 4
    std::cout << "\n";
    
    // Print all odd (not even) numbers.
    std::copy_if(std::cbegin(v), std::cend(v), ostream_it, std::not_fn(is_even)); // 1 3
}
```

### std::shared_mutex

Allows shared and exclusive access to resource.

Shared mutexes are especially useful when shared data can be safely read by any number of threads simultaneously, but a thread may only write the same data when no other thread is reading or writing at the same time. 

// Compile with `-std=c++17 -pthread`
```cpp
#include <iostream>
#include <thread>
#include <shared_mutex>

int value = 0;
std::shared_mutex mutex;

// Reads the value and sets v to that value
void readValue(int& v)
{
    std::shared_lock<std::shared_mutex> guard(mutex);
    for (std::size_t i = 0; i < 3; ++i)
    {
        std::cout << "read" << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        v = value;
    }
}

// Sets value to v
void setValue(int v)
{
    std::lock_guard<std::shared_mutex> guard(mutex);

    // Simulate some latency
    std::this_thread::sleep_for(std::chrono::milliseconds(400));
    std::cout << "WRITE" << std::endl;
    value = v;
}

int main()
{
    int read1;
    int read2;
    int read3;
    std::thread t1(readValue, std::ref(read1));
    std::thread t2(readValue, std::ref(read2));
    std::thread t3(readValue, std::ref(read3));
    std::thread t4(setValue, 1);

    t1.join();
    t2.join();
    t3.join();
    t4.join();

    std::cout << read1 << "\n";
    std::cout << read2 << "\n";
    std::cout << read3 << "\n";
    std::cout << value << "\n";
}
```