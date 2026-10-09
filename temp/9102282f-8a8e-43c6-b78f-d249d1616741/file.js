name = "Sumayya"
numbers = [10, 20, 30, 40, 50]

total = sum(numbers)
average = total / len(numbers)

print("Hello,", name)
print("Numbers:", numbers)
print("Total:", total)
print("Average:", average)

if average >= 30:
    print("Test passed successfully!")
else:
    print("Test failed!")