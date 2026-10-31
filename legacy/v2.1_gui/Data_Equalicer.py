"""Conversor de edad para sondeo 977"""
import pandas as pd
import os
from pandas import DataFrame
from tkinter import filedialog
import tkinter as tk
import config
import numpy as np

"""____window set_____"""
window=tk.Toplevel()
window.title('IchnopaleoCount alfa 1.0')
window.wm_iconbitmap("IconWindow.ico")
window.wm_title("Interpolator Alfa 1")
window.attributes("-topmost", True)

L2=tk.Label(window,text="Select archive")
"""______Frame set___"""
Frame1=tk.Frame(window)
Frame2=tk.Frame(window)
Frame3=tk.Frame(window)
Frame4=tk.Frame(window)
Frame1.grid(row= 0, column=0, columnspan=2 )
Frame2.grid(row= 1, column=0 )
Frame3.grid(row= 1, column= 1)
Frame4.grid(row= 2, column= 0, columnspan=2)
"""___Frame 1___"""

L1=tk.Label(Frame1,text="Select archive where the  Data Frame is located")
L1.grid(row= 0, column=0)
L2=tk.Label(Frame1,text="Select archive where age or deth data which will be interpolated is located")
L2.grid(row= 1, column=0)
PathDataFrame=""
PathInterpD=""
def GetfileDataFrame():
    global PathDataFrame
    global DONE1
    if PathDataFrame != "":
        DONE1.destroy()
    PathDataFrame=filedialog.askopenfilename(initialdir = config.PathtoWfolder,title = "Select file (xlsx)")
    DONE1=tk.Label(Frame1,text=PathDataFrame)
    DONE1.grid(row=0,column=3)
def GetfileinterpD():
    global PathInterpD
    global DONE2
    if PathInterpD != "":
        DONE2.destroy()
    PathInterpD=filedialog.askopenfilename(initialdir = config.PathtoWfolder,title = "Select file (xlsx)")
    DONE2=tk.Label(Frame1,text=PathInterpD)
    DONE2.grid(row=1,column=3)
B1=tk.Button(Frame1,text="get file",command=lambda:GetfileDataFrame())
B2=tk.Button(Frame1,text="get file",command=lambda:GetfileinterpD())
B1.grid(row= 0, column=1)
B2.grid(row= 1, column=1)

"""___VARs___"""
ColumnData=tk.StringVar()
SheetData=tk.StringVar()
ColumnAge=tk.StringVar()
SheetAgeI=tk.StringVar()
ColumnAgeI=tk.StringVar()
"""___Frame 2___"""
L3=tk.Label(Frame2,text="Sheet name where data and age is located")
L3.grid(row= 0, column=0)
tk.Entry(Frame2,textvariable=SheetData).grid(row= 0, column=1)
L4=tk.Label(Frame2,text="Column where age model is located")
L4.grid(row= 1, column=0)
tk.Entry(Frame2,textvariable=ColumnAge).grid(row= 1, column=1)
L5=tk.Label(Frame2,text="Column where data model is located")
L5.grid(row= 2, column=0)
tk.Entry(Frame2,textvariable=ColumnData).grid(row= 2, column=1)

"""___Frame 3___"""
L6=tk.Label(Frame3,text="Sheet Name for depth in data tu be converted")
L6.grid(row= 0, column=0)
tk.Entry(Frame3,textvariable=SheetAgeI).grid(row= 0, column=1)
L7=tk.Label(Frame3,text="Column where Age who needs a data is located")
L7.grid(row= 1, column=0)
tk.Entry(Frame3,textvariable=ColumnAgeI).grid(row= 1, column=1)

"""___Frame 4___"""

def CombertAge(DataVars,AgeIVars,Folders):
    from pprint import pprint
    Data1=pd.read_excel(Folders[0],sheet_name=DataVars[0],usecols=DataVars[2])
    Age1=pd.read_excel(Folders[0],sheet_name=DataVars[0],usecols=DataVars[1])
    Age2=pd.read_excel(Folders[1],sheet_name=AgeIVars[0],usecols=AgeIVars[1])
    pprint(Data1)
    pprint(Age1)
    pprint(Age2)
    Data1=Data1[Data1.columns[0]].to_numpy()
    Age1=Age1[Age1.columns[0]].to_numpy()
    Age2=Age2[Age2.columns[0]].to_numpy()
    for d in Data1:
        pprint(d)
    for d in Age1:
        pprint(d)
    for d in Age2:
        pprint(d)
    print(Data1.shape)
    print(Age1.shape)
    print(Age2.shape)

    NewData=list()
    PrevDepI=int(0)
    PostDepI=int(1)
    PrevAgeI=int(0)
    PostAgeI=int(1)
    count=0
####|
    for i in Age2:
        if i <= Age2[Age2.shape[0]-1]:

            while i >= Age1[PostDepI]:
                
                print("____ "+str(count)+" Iteration______")
                print("Age = "+str(i))
                print("between "+ str(Age1[PrevDepI]))
                print("and " + str(Age1[PostDepI]))
                print("indexes: "+str(PrevDepI)+","+str(PostDepI))
                
                PrevDepI=PrevDepI+1
                
                PostDepI=PostDepI+1
                count=count+1
                


            
            print("____ "+str(count)+" Iteration______")
            print("Age = "+str(i))
            print("between "+ str(Age1[PrevDepI]))
            print("and " + str(Age1[PostDepI]))
            print("indexes: "+str(PrevDepI)+","+str(PostDepI))
            count=count+1
            if i< Age1[0]:
                print("age not done")
                NewData.append("No Data")
            else:
                if i<Age1[PostDepI] and i>Age1[PrevDepI]:
                     A1=Data1[PrevDepI]
                     A2=Data1[PostDepI]
                     D1=Age1[PrevDepI]
                     D2=Age1[PostDepI]
                     Data=A1+((i-D1)*(A2-A1)/(D2-D1))
                     NewData.append(Data)
                     print("added"+ str(Data))
                else:
                     if i==Age1[PostDepI]:
                         NewData.append(Data1[PostDepI])
                         print("added"+ str(Data1[PostDepI]))
                     else:
                        if i==Age1[PrevDepI]:
                            NewData.append(Data1[PrevDepI])
                            print("added"+ str(Data1[PrevDepI]))

        else:
            print("end")
    pprint(NewData)
    df = pd.DataFrame.from_dict({'Age':Age2,'Data':NewData})
    ruta=filedialog.askdirectory(title='Please select a directory to save ')
    df.to_excel(ruta + "/" + "test.xlsx", header=True, index=False)






def ConvertAgetoAge():
    from pprint import pprint

    DataVars=[SheetData.get(),ColumnAge.get(),ColumnData.get()]
    AgeIVars=[SheetAgeI.get(),ColumnAgeI.get()]
    Folders=[PathDataFrame,PathInterpD]
    CombertAge(DataVars,AgeIVars,Folders)
B3=tk.Button(Frame4,text="go",command=lambda:ConvertAgetoAge())
B3.grid(row=0)

